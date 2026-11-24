// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts-v5.7/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts-v5.7/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts-v5.7/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts-v5.7/utils/ReentrancyGuard.sol";

import {AdvancedTokenInit} from "./AdvancedTokenCore.sol";
import {PermitDeployer} from "./PermitDeployer.sol";
import {TokenDeployer} from "./TokenDeployer.sol";
import {VestingDeployer} from "./VestingDeployer.sol";
import {VotesDeployer} from "./VotesDeployer.sol";
import {AggregatorV3Interface} from "../vendor/AggregatorV3Interface.sol";

/**
 * @title AdvancedTokenFactory
 * @notice Deploys advanced tokens and vesting wallets. Charges a USD fee converted with Chainlink.
 * @dev Option prices are storage, set at construction for one network and changeable by the owner.
 *      Nothing in this contract branches on chain id.
 *      Whole-token amounts in the public ABI are scaled by 10 ** decimals exactly once.
 *      The token then stores those raw base units and does not scale again.
 */
contract AdvancedTokenFactory is Ownable2Step, Pausable, ReentrancyGuard {
    struct TokenConfig {
        string name;
        string symbol;
        uint8 decimals;
        uint256 initialSupply;
        address initialOwner;
    }

    struct FeatureFlags {
        bool initialDistribution;
        bool mint;
        bool burn;
        bool pause;
        bool transferFee;
        bool permit;
        bool votes;
    }

    struct TaxConfig {
        address feeRecipient;
        uint16 buyFeeBps;
        uint16 sellFeeBps;
    }

    struct AdvancedConfig {
        address[] distributionRecipients;
        uint256[] distributionAmounts;
        TaxConfig tax;
        uint256 cap;
    }

    struct FeeSchedule {
        uint256 baseFeeUsdWei;
        uint256 mintFeeUsdWei;
        uint256 burnFeeUsdWei;
        uint256 distributionFeeUsdWei;
        uint256 pauseFeeUsdWei;
        uint256 transferFeeUsdWei;
        uint256 permitFeeUsdWei;
        uint256 votesFeeUsdWei;
        uint256 vestingFeeUsdWei;
    }

    struct Deployers {
        address token;
        address permit;
        address votes;
        address vesting;
    }

    uint256 public constant MAX_PRICE_AGE = 1 hours;
    /// @notice After an L2 sequencer recovers, quotes stay disabled for this long. Chainlink uses `<=`.
    uint256 public constant SEQUENCER_GRACE_PERIOD = 1 hours;
    uint256 private constant PRICE_SCALE = 1e18;
    uint256 private constant MIN_NORMALIZED_PRICE = 1e16;
    uint256 private constant MAX_NORMALIZED_PRICE = 1e25;
    uint8 private constant TARGET_DECIMALS = 18;
    uint256 private constant MAX_NAME_LENGTH = 100;
    uint256 private constant MAX_SYMBOL_LENGTH = 20;
    uint256 private constant MAX_PERMIT_NAME_LENGTH = 31;

    bytes32 public constant OPTION_MINT = "mint";
    bytes32 public constant OPTION_BURN = "burn";
    bytes32 public constant OPTION_DISTRIBUTION = "distribution";
    bytes32 public constant OPTION_PAUSE = "pause";
    bytes32 public constant OPTION_TRANSFER_FEE = "transferFee";
    bytes32 public constant OPTION_PERMIT = "permit";
    bytes32 public constant OPTION_VOTES = "votes";
    bytes32 public constant OPTION_VESTING = "vesting";

    AggregatorV3Interface public immutable priceFeed;
    /// @notice Chainlink L2 sequencer uptime feed. The zero address disables the check (L1).
    AggregatorV3Interface public immutable sequencerUptimeFeed;
    address payable public feeRecipient;
    TokenDeployer public immutable tokenDeployer;
    PermitDeployer public immutable permitDeployer;
    VotesDeployer public immutable votesDeployer;
    VestingDeployer public immutable vestingDeployer;

    uint256 public baseFeeUsdWei;
    uint256 public mintFeeUsdWei;
    uint256 public burnFeeUsdWei;
    uint256 public distributionFeeUsdWei;
    uint256 public pauseFeeUsdWei;
    uint256 public transferFeeUsdWei;
    uint256 public permitFeeUsdWei;
    uint256 public votesFeeUsdWei;
    uint256 public vestingFeeUsdWei;

    mapping(address creator => uint256) private _nonces;

    event AdvancedTokenCreated(
        address indexed creator,
        address indexed token,
        string name,
        string symbol,
        uint8 decimals,
        uint256 totalSupply,
        uint256 feePaid
    );
    event VestingWalletCreated(
        address indexed creator,
        address indexed wallet,
        address indexed beneficiary,
        uint64 startTimestamp,
        uint64 durationSeconds,
        uint64 cliffSeconds,
        uint256 feePaid
    );
    event FeeCollected(address indexed from, uint256 amount, address indexed recipient);
    event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
    event BaseFeeUpdated(uint256 previousFeeUsdWei, uint256 newFeeUsdWei);
    event OptionFeeUpdated(bytes32 indexed option, uint256 previousFeeUsdWei, uint256 newFeeUsdWei);
    event RefundFailed(address indexed recipient, uint256 amount, address indexed fallbackRecipient);

    error ZeroAddress();
    error NotAContract(address account);
    error InvalidName();
    error InvalidSymbol();
    error DecimalsOutOfRange();
    error SupplyOverflow();
    error PermitNameTooLong(uint256 length);
    error BadDistribution();
    error TaxConfigMismatch();
    error InsufficientFee(uint256 required, uint256 sent);
    error FeeAboveMax(uint256 required, uint256 maxFee);
    error FeeRoundsToZero(uint256 feeUsdWei, uint256 normalizedPrice);
    error SequencerDown();
    error InvalidSequencerRound();
    error SequencerGracePeriod(uint256 startedAt);
    error InvalidPrice();
    error StaleRound();
    error InvalidTimestamp();
    error PriceTooOld();
    error PriceOutOfBounds();
    error FeeTransferFailed();
    error RefundFailedBoth();
    error UnknownOption(bytes32 option);
    error RenounceWhilePaused();
    error VestingAlreadyFinished(uint64 startTimestamp, uint64 durationSeconds);

    constructor(
        address aggregator_,
        address sequencerUptimeFeed_,
        address payable feeRecipient_,
        FeeSchedule memory fees,
        Deployers memory deployers
    ) Ownable(msg.sender) {
        if (aggregator_ == address(0) || feeRecipient_ == address(0)) revert ZeroAddress();
        if (sequencerUptimeFeed_ != address(0)) _requireContract(sequencerUptimeFeed_);
        _requireContract(deployers.token);
        _requireContract(deployers.permit);
        _requireContract(deployers.votes);
        _requireContract(deployers.vesting);

        priceFeed = AggregatorV3Interface(aggregator_);
        sequencerUptimeFeed = AggregatorV3Interface(sequencerUptimeFeed_);
        feeRecipient = feeRecipient_;
        tokenDeployer = TokenDeployer(deployers.token);
        permitDeployer = PermitDeployer(deployers.permit);
        votesDeployer = VotesDeployer(deployers.votes);
        vestingDeployer = VestingDeployer(deployers.vesting);

        baseFeeUsdWei = fees.baseFeeUsdWei;
        mintFeeUsdWei = fees.mintFeeUsdWei;
        burnFeeUsdWei = fees.burnFeeUsdWei;
        distributionFeeUsdWei = fees.distributionFeeUsdWei;
        pauseFeeUsdWei = fees.pauseFeeUsdWei;
        transferFeeUsdWei = fees.transferFeeUsdWei;
        permitFeeUsdWei = fees.permitFeeUsdWei;
        votesFeeUsdWei = fees.votesFeeUsdWei;
        vestingFeeUsdWei = fees.vestingFeeUsdWei;
    }

    function deployAdvancedToken(
        TokenConfig calldata config,
        FeatureFlags calldata flags,
        AdvancedConfig calldata advanced,
        uint256 maxFee
    ) external payable whenNotPaused nonReentrant returns (address token) {
        uint256 requiredFee = currentFee(flags);
        if (requiredFee > maxFee) revert FeeAboveMax(requiredFee, maxFee);
        if (msg.value < requiredFee) revert InsufficientFee(requiredFee, msg.value);

        (AdvancedTokenInit memory init, uint256 rawSupply) = _buildInit(config, flags, advanced);
        bytes32 salt = _salt(msg.sender, config.name, config.symbol);
        _nonces[msg.sender]++;
        if (flags.votes) {
            token = votesDeployer.deploy(init, salt);
        } else if (flags.permit) {
            token = permitDeployer.deploy(init, salt);
        } else {
            token = tokenDeployer.deploy(init, salt);
        }
        _takePayment(requiredFee);
        emit AdvancedTokenCreated(msg.sender, token, config.name, config.symbol, config.decimals, rawSupply, requiredFee);
    }

    function createVestingWallet(
        address beneficiary,
        uint64 startTimestamp,
        uint64 durationSeconds,
        uint64 cliffSeconds,
        uint256 maxFee
    ) external payable whenNotPaused nonReentrant returns (address wallet) {
        if (beneficiary == address(0)) revert ZeroAddress();
        if (uint256(startTimestamp) + uint256(durationSeconds) <= block.timestamp) {
            revert VestingAlreadyFinished(startTimestamp, durationSeconds);
        }
        uint256 requiredFee = currentVestingFee();
        if (requiredFee > maxFee) revert FeeAboveMax(requiredFee, maxFee);
        if (msg.value < requiredFee) revert InsufficientFee(requiredFee, msg.value);
        bytes32 salt = _salt(msg.sender, "vesting", "vest");
        _nonces[msg.sender]++;
        wallet = vestingDeployer.deploy(beneficiary, startTimestamp, durationSeconds, cliffSeconds, salt);
        _takePayment(requiredFee);
        emit VestingWalletCreated(msg.sender, wallet, beneficiary, startTimestamp, durationSeconds, cliffSeconds, requiredFee);
    }

    function currentFee(FeatureFlags calldata flags) public view returns (uint256) {
        return _quoteNative(_usdFor(flags));
    }

    function currentVestingFee() public view returns (uint256) {
        return _quoteNative(vestingFeeUsdWei);
    }

    function getNonce(address creator) external view returns (uint256) {
        return _nonces[creator];
    }

    function setFeeRecipient(address payable newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        address previous = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(previous, newRecipient);
    }

    function setBaseFee(uint256 newFeeUsdWei) external onlyOwner {
        uint256 previous = baseFeeUsdWei;
        baseFeeUsdWei = newFeeUsdWei;
        emit BaseFeeUpdated(previous, newFeeUsdWei);
    }

    function setOptionFee(bytes32 option, uint256 newFeeUsdWei) external onlyOwner {
        uint256 previous;
        if (option == OPTION_MINT) {
            previous = mintFeeUsdWei;
            mintFeeUsdWei = newFeeUsdWei;
        } else if (option == OPTION_BURN) {
            previous = burnFeeUsdWei;
            burnFeeUsdWei = newFeeUsdWei;
        } else if (option == OPTION_DISTRIBUTION) {
            previous = distributionFeeUsdWei;
            distributionFeeUsdWei = newFeeUsdWei;
        } else if (option == OPTION_PAUSE) {
            previous = pauseFeeUsdWei;
            pauseFeeUsdWei = newFeeUsdWei;
        } else if (option == OPTION_TRANSFER_FEE) {
            previous = transferFeeUsdWei;
            transferFeeUsdWei = newFeeUsdWei;
        } else if (option == OPTION_PERMIT) {
            previous = permitFeeUsdWei;
            permitFeeUsdWei = newFeeUsdWei;
        } else if (option == OPTION_VOTES) {
            previous = votesFeeUsdWei;
            votesFeeUsdWei = newFeeUsdWei;
        } else if (option == OPTION_VESTING) {
            previous = vestingFeeUsdWei;
            vestingFeeUsdWei = newFeeUsdWei;
        } else {
            revert UnknownOption(option);
        }
        emit OptionFeeUpdated(option, previous, newFeeUsdWei);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Renounce is rejected while the factory is paused, so `unpause` stays reachable.
    function renounceOwnership() public override onlyOwner {
        if (paused()) revert RenounceWhilePaused();
        super.renounceOwnership();
    }

    function _usdFor(FeatureFlags calldata flags) internal view returns (uint256 fee) {
        fee = baseFeeUsdWei;
        if (flags.mint) fee += mintFeeUsdWei;
        if (flags.burn) fee += burnFeeUsdWei;
        if (flags.initialDistribution) fee += distributionFeeUsdWei;
        if (flags.pause) fee += pauseFeeUsdWei;
        if (flags.transferFee) fee += transferFeeUsdWei;
        if (flags.permit) fee += permitFeeUsdWei;
        if (flags.votes) fee += votesFeeUsdWei;
    }

    /// @dev A positive USD fee that rounds to 0 native wei reverts. It is not treated as a free deploy.
    ///      A zero USD fee does not read the price or the sequencer feed.
    function _quoteNative(uint256 feeUsd) internal view returns (uint256) {
        if (feeUsd == 0) return 0;
        _checkSequencer();
        (uint80 roundId, int256 price,, uint256 updatedAt, uint80 answeredInRound) = priceFeed.latestRoundData();
        if (price <= 0) revert InvalidPrice();
        if (answeredInRound < roundId) revert StaleRound();
        if (block.timestamp < updatedAt) revert InvalidTimestamp();
        if (block.timestamp - updatedAt > MAX_PRICE_AGE) revert PriceTooOld();

        uint256 normalized = _scalePrice(uint256(price), priceFeed.decimals(), TARGET_DECIMALS);
        if (normalized < MIN_NORMALIZED_PRICE || normalized > MAX_NORMALIZED_PRICE) revert PriceOutOfBounds();

        uint256 nativeFee = (feeUsd * PRICE_SCALE) / normalized;
        if (nativeFee == 0) revert FeeRoundsToZero(feeUsd, normalized);
        return nativeFee;
    }

    /// @dev `answer == 0` means the sequencer is up. Any other answer is treated as down.
    ///      Grace uses `<=`, matching the Chainlink consumer example: exactly one hour is still inside the window.
    function _checkSequencer() internal view {
        if (address(sequencerUptimeFeed) == address(0)) return;
        (, int256 answer, uint256 startedAt,,) = sequencerUptimeFeed.latestRoundData();
        if (startedAt == 0 || block.timestamp < startedAt) revert InvalidSequencerRound();
        if (answer != 0) revert SequencerDown();
        if (block.timestamp - startedAt <= SEQUENCER_GRACE_PERIOD) revert SequencerGracePeriod(startedAt);
    }

    function _buildInit(TokenConfig calldata config, FeatureFlags calldata flags, AdvancedConfig calldata advanced)
        internal
        view
        returns (AdvancedTokenInit memory init, uint256 rawSupply)
    {
        uint256 nameLength = bytes(config.name).length;
        if (nameLength == 0 || nameLength > MAX_NAME_LENGTH) revert InvalidName();
        if (flags.permit || flags.votes) {
            if (nameLength > MAX_PERMIT_NAME_LENGTH) revert PermitNameTooLong(nameLength);
        }
        uint256 symbolLength = bytes(config.symbol).length;
        if (symbolLength == 0 || symbolLength > MAX_SYMBOL_LENGTH) revert InvalidSymbol();
        if (config.decimals > 30) revert DecimalsOutOfRange();

        address owner = config.initialOwner == address(0) ? msg.sender : config.initialOwner;
        uint256 multiplier = 10 ** uint256(config.decimals);
        rawSupply = _scale(config.initialSupply, multiplier);
        uint256 rawCap = advanced.cap == 0 ? 0 : _scale(advanced.cap, multiplier);

        init.name = config.name;
        init.symbol = config.symbol;
        init.decimals = config.decimals;
        init.initialSupply = rawSupply;
        init.initialOwner = owner;
        init.factory = address(this);
        init.hasMint = flags.mint;
        init.hasBurn = flags.burn;
        init.hasPause = flags.pause;
        init.hasTax = flags.transferFee;
        init.cap = rawCap;

        if (flags.transferFee) {
            init.feeRecipient = advanced.tax.feeRecipient;
            init.buyFeeBps = advanced.tax.buyFeeBps;
            init.sellFeeBps = advanced.tax.sellFeeBps;
        } else if (advanced.tax.buyFeeBps != 0 || advanced.tax.sellFeeBps != 0) {
            revert TaxConfigMismatch();
        }

        if (flags.initialDistribution) {
            uint256 count = advanced.distributionRecipients.length;
            if (count == 0 || count != advanced.distributionAmounts.length) revert BadDistribution();
            init.recipients = new address[](count);
            init.amounts = new uint256[](count);
            for (uint256 i; i < count; ++i) {
                init.recipients[i] = advanced.distributionRecipients[i];
                init.amounts[i] = _scale(advanced.distributionAmounts[i], multiplier);
            }
        } else if (advanced.distributionRecipients.length != 0 || advanced.distributionAmounts.length != 0) {
            revert BadDistribution();
        }
    }

    function _scale(uint256 wholeTokens, uint256 multiplier) private pure returns (uint256) {
        if (wholeTokens == 0) return 0;
        if (wholeTokens > type(uint256).max / multiplier) revert SupplyOverflow();
        return wholeTokens * multiplier;
    }

    function _takePayment(uint256 requiredFee) private {
        if (requiredFee > 0) {
            (bool ok,) = feeRecipient.call{value: requiredFee}("");
            if (!ok) revert FeeTransferFailed();
            emit FeeCollected(msg.sender, requiredFee, feeRecipient);
        }
        if (msg.value > requiredFee) {
            uint256 refund = msg.value - requiredFee;
            (bool okRefund,) = payable(msg.sender).call{value: refund}("");
            if (!okRefund) {
                emit RefundFailed(msg.sender, refund, feeRecipient);
                (bool okFallback,) = feeRecipient.call{value: refund}("");
                if (!okFallback) revert RefundFailedBoth();
            }
        }
    }

    function _scalePrice(uint256 price, uint8 priceDecimals, uint8 targetDecimals) private pure returns (uint256) {
        if (priceDecimals == targetDecimals) return price;
        if (priceDecimals < targetDecimals) return price * (10 ** uint256(targetDecimals - priceDecimals));
        return price / (10 ** uint256(priceDecimals - targetDecimals));
    }

    function _salt(address creator, string memory name, string memory symbol) private view returns (bytes32) {
        return keccak256(abi.encode(creator, name, symbol, _nonces[creator], block.prevrandao, block.number));
    }

    function _requireContract(address account) private view {
        if (account.code.length == 0) revert NotAContract(account);
    }
}
