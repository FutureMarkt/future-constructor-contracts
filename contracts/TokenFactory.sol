// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./BasicERC20.sol";
import "./vendor/AggregatorV3Interface.sol";

/**
 * @title TokenFactory
 * @notice Deploys minimal ERC-20 tokens and charges a configurable USD fee in native currency.
 * @dev Uses Chainlink price feeds to convert USD fees to native tokens at deployment time.
 */
contract TokenFactory is Ownable, Pausable, ReentrancyGuard {
    struct TokenConfig {
        string name;
        string symbol;
        uint8 decimals;
        uint256 initialSupply;
        address initialOwner;
    }

    /// @notice Maximum age of price feed data (1 hour)
    uint256 public constant MAX_PRICE_AGE = 1 hours;
    /// @notice Maximum number of decimals for tokens (ERC-20 standard limit)
    uint8 private constant MAX_DECIMALS = 30;
    /// @notice Minimum number of decimals (0 for native-like tokens)
    uint8 private constant MIN_DECIMALS = 0;
    /// @notice Maximum length for token name
    uint256 private constant MAX_NAME_LENGTH = 100;
    /// @notice Maximum length for token symbol
    uint256 private constant MAX_SYMBOL_LENGTH = 20;
    /// @notice Price scale factor (18 decimals)
    uint256 private constant PRICE_SCALE = 1e18;
    /// @notice Minimum normalized price (prevents division by extremely small values)
    /// Equivalent to $0.01 USD with 18 decimals
    uint256 private constant MIN_NORMALIZED_PRICE = 1e16;
    /// @notice Maximum normalized price (prevents overflow)
    /// Equivalent to $10,000,000 USD with 18 decimals
    uint256 private constant MAX_NORMALIZED_PRICE = 1e25;
    /// @notice Target decimals for price normalization
    uint8 private constant TARGET_DECIMALS = 18;

    /// @notice Chainlink price feed aggregator (immutable after deployment)
    AggregatorV3Interface public immutable priceFeed;
    /// @notice Address that receives collected fees
    address payable public feeRecipient;
    /// @notice Fee in USD expressed with 18 decimals (0 = no fee)
    uint256 public feeUsdWei;
    /// @notice Nonce counter for each creator to improve salt uniqueness
    mapping(address => uint256) private _nonces;

    event TokenCreated(
        address indexed creator,
        address indexed token,
        string name,
        string symbol,
        uint8 decimals,
        uint256 totalSupply,
        uint256 feePaid
    );

    event FeeCollected(address indexed from, uint256 amount, address indexed recipient);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event FeeUsdWeiUpdated(uint256 oldFeeUsdWei, uint256 newFeeUsdWei);
    event RefundFailed(address indexed recipient, uint256 amount, address indexed fallbackRecipient);

    /**
     * @notice Creates a new TokenFactory contract
     * @param aggregator_ Address of Chainlink price feed aggregator
     * @param feeRecipient_ Address that will receive fees
     * @param feeUsdWei_ Initial fee in USD (18 decimals, 0 = no fee)
     * @dev All parameters must be non-zero addresses (except feeUsdWei_ can be 0)
     */
    constructor(address aggregator_, address payable feeRecipient_, uint256 feeUsdWei_) Ownable(msg.sender) {
        require(aggregator_ != address(0), "Aggregator is zero");
        require(feeRecipient_ != address(0), "Fee recipient is zero");
        require(msg.sender != address(0), "Owner is zero");

        priceFeed = AggregatorV3Interface(aggregator_);
        feeRecipient = feeRecipient_;
        feeUsdWei = feeUsdWei_;
    }

    /**
     * @notice Deploys a new ERC-20 token with specified configuration
     * @param config Token configuration (name, symbol, decimals, supply, owner)
     * @return token Address of the deployed token contract
     * @dev Requires sufficient fee payment if feeUsdWei > 0
     * @dev Excess payment is refunded to msg.sender
     * @dev If refund fails, excess is sent to feeRecipient to prevent loss of funds
     */
    function deployToken(TokenConfig calldata config)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (address token)
    {
        // Validate inputs
        require(bytes(config.name).length > 0 && bytes(config.name).length <= MAX_NAME_LENGTH, "Invalid name length");
        require(bytes(config.symbol).length > 0 && bytes(config.symbol).length <= MAX_SYMBOL_LENGTH, "Invalid symbol length");
        require(config.decimals >= MIN_DECIMALS && config.decimals <= MAX_DECIMALS, "Decimals out of range");

        address owner = config.initialOwner == address(0) ? msg.sender : config.initialOwner;
        require(owner != address(0), "Owner is zero");

        // Calculate required fee
        uint256 requiredFee = currentFee();
        if (requiredFee > 0) {
            require(msg.value >= requiredFee, "Insufficient fee");
        }

        // Generate unique salt with nonce to prevent front-running
        bytes32 salt = _salt(msg.sender, config.name, config.symbol);
        
        // Deploy token contract
        token = address(
            new BasicERC20{salt: salt}(
                config.name,
                config.symbol,
                config.decimals,
                config.initialSupply,
                owner
            )
        );

        // Increment nonce for future deployments by this creator
        _nonces[msg.sender]++;

        // Calculate minted amount (for event)
        uint256 decimalsMultiplier = 10 ** uint256(config.decimals);
        uint256 mintedAmount = config.initialSupply * decimalsMultiplier;

        // Collect fee if required
        if (requiredFee > 0) {
            _collectFee(requiredFee);
        }

        // Refund excess payment
        if (msg.value > requiredFee) {
            uint256 refund = msg.value - requiredFee;
            (bool okRefund,) = payable(msg.sender).call{value: refund}("");
            if (!okRefund) {
                // If refund fails (e.g., recipient is a contract without receive function),
                // send to feeRecipient to prevent loss of funds
                emit RefundFailed(msg.sender, refund, feeRecipient);
                (bool okFallback,) = feeRecipient.call{value: refund}("");
                require(okFallback, "Refund and fallback failed");
            }
        }

        emit TokenCreated(
            msg.sender,
            token,
            config.name,
            config.symbol,
            config.decimals,
            mintedAmount,
            requiredFee
        );
    }

    /**
     * @notice Calculates the current fee in native currency
     * @return The fee amount in wei (native token units)
     * @dev Queries Chainlink price feed and converts USD fee to native tokens
     * @dev Validates price bounds to prevent manipulation
     * @custom:security Checks for stale prices, zero prices, and extreme values
     */
    function currentFee() public view returns (uint256) {
        // If fee is 0, return 0 without querying Chainlink (gas optimization)
        uint256 fee = feeUsdWei;
        if (fee == 0) {
            return 0;
        }

        // Query price feed data
        (uint80 roundId, int256 price,, uint256 updatedAt, uint80 answeredInRound) = priceFeed.latestRoundData();

        // Validate price feed data
        require(price > 0, "Invalid price");
        require(answeredInRound >= roundId, "Stale round");
        require(block.timestamp >= updatedAt, "Invalid timestamp");
        require(block.timestamp - updatedAt <= MAX_PRICE_AGE, "Price too old");

        // Normalize price to 18 decimals
        uint8 feedDecimals = priceFeed.decimals();
        uint256 priceUint = uint256(price);
        uint256 normalizedPrice = _scalePrice(priceUint, feedDecimals, TARGET_DECIMALS);
        
        // Validate normalized price bounds to prevent manipulation
        require(normalizedPrice >= MIN_NORMALIZED_PRICE, "Price too low");
        require(normalizedPrice <= MAX_NORMALIZED_PRICE, "Price too high");
        require(normalizedPrice > 0, "Price normalization failed");

        // Calculate fee: (feeUsdWei * 1e18) / normalizedPrice
        // This gives native token amount equivalent to feeUsdWei USD
        return (fee * PRICE_SCALE) / normalizedPrice;
    }

    /**
     * @notice Get the nonce for a creator address
     * @param creator Address to query nonce for
     * @return The current nonce value for the creator
     * @dev Nonces are used to prevent predictable token addresses
     */
    function getNonce(address creator) external view returns (uint256) {
        return _nonces[creator];
    }

    /**
     * @notice Updates the fee recipient address
     * @param newRecipient New address to receive fees
     * @dev Only callable by owner
     * @dev Cannot be set to zero address
     */
    function setFeeRecipient(address payable newRecipient) external onlyOwner {
        require(newRecipient != address(0), "Recipient is zero");
        address previous = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(previous, newRecipient);
    }

    /**
     * @notice Updates the fee amount in USD (18 decimals)
     * @param newFeeUsdWei New fee amount (0 = no fee)
     * @dev Only callable by owner
     * @dev Fee is expressed in USD with 18 decimals
     */
    function setFeeUsdWei(uint256 newFeeUsdWei) external onlyOwner {
        uint256 previous = feeUsdWei;
        feeUsdWei = newFeeUsdWei;
        emit FeeUsdWeiUpdated(previous, newFeeUsdWei);
    }

    /**
     * @notice Pauses token deployment
     * @dev Only callable by owner
     * @dev When paused, deployToken() will revert
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpauses token deployment
     * @dev Only callable by owner
     * @dev Restores normal operation of deployToken()
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Internal function to collect and transfer fees
     * @param amount Amount to transfer in wei
     * @dev Sends native tokens to feeRecipient
     * @dev Reverts if transfer fails
     */
    function _collectFee(uint256 amount) private {
        (bool ok,) = feeRecipient.call{value: amount}("");
        require(ok, "Fee transfer failed");
        emit FeeCollected(msg.sender, amount, feeRecipient);
    }

    /**
     * @notice Scales price from source decimals to target decimals
     * @param price Original price value
     * @param priceDecimals Number of decimals in original price
     * @param targetDecimals Target number of decimals
     * @return Scaled price value
     * @dev Internal pure function for price normalization
     */
    function _scalePrice(uint256 price, uint8 priceDecimals, uint8 targetDecimals)
        internal
        pure
        returns (uint256)
    {
        if (priceDecimals == targetDecimals) {
            return price;
        } else if (priceDecimals < targetDecimals) {
            uint256 factor = 10 ** uint256(targetDecimals - priceDecimals);
            return price * factor;
        } else {
            uint256 factor = 10 ** uint256(priceDecimals - targetDecimals);
            return price / factor;
        }
    }

    /**
     * @notice Generates a unique salt for token deployment
     * @param creator Address creating the token
     * @param name Token name
     * @param symbol Token symbol
     * @return bytes32 Unique salt for CREATE2 deployment
     * @dev Uses creator address, token metadata, nonce, and block.prevrandao for unpredictability
     * @dev Prevents front-running by including per-creator nonce
     */
    function _salt(address creator, string memory name, string memory symbol) private view returns (bytes32) {
        // Use nonce, prevrandao, and block info to prevent predictability
        // block.prevrandao (formerly block.random) is available in post-merge chains
        return keccak256(abi.encode(
            creator,
            name,
            symbol,
            _nonces[creator],
            block.prevrandao,
            block.number
        ));
    }
}
