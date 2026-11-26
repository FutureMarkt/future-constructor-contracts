// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IMockERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @notice Minimal Uniswap V2 pair: mint liquidity from balances and swap with the 0.30% K check.
 * @dev Output is sent before the input is measured, matching the V2 pair.
 */
contract MockUniswapV2Pair {
    address public immutable token0;
    address public immutable token1;

    uint112 private _reserve0;
    uint112 private _reserve1;
    uint256 public totalSupply;
    mapping(address account => uint256) public balanceOf;

    constructor(address tokenA, address tokenB) {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) {
        return (_reserve0, _reserve1, uint32(block.timestamp));
    }

    function mint(address to) external returns (uint256 liquidity) {
        uint256 balance0 = IMockERC20(token0).balanceOf(address(this));
        uint256 balance1 = IMockERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        if (totalSupply == 0) {
            liquidity = _sqrt(amount0 * amount1);
            require(liquidity > 1000, "INSUFFICIENT_LIQUIDITY");
            balanceOf[address(0)] = 1000;
            totalSupply = 1000;
            liquidity -= 1000;
        } else {
            liquidity = _min((amount0 * totalSupply) / _reserve0, (amount1 * totalSupply) / _reserve1);
        }
        require(liquidity > 0, "INSUFFICIENT_LIQUIDITY_MINTED");
        balanceOf[to] += liquidity;
        totalSupply += liquidity;
        _writeReserves(balance0, balance1);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to) external {
        require(amount0Out > 0 || amount1Out > 0, "INSUFFICIENT_OUTPUT");
        require(amount0Out < _reserve0 && amount1Out < _reserve1, "INSUFFICIENT_LIQUIDITY");
        require(to != token0 && to != token1, "INVALID_TO");

        if (amount0Out > 0) require(IMockERC20(token0).transfer(to, amount0Out), "TRANSFER0");
        if (amount1Out > 0) require(IMockERC20(token1).transfer(to, amount1Out), "TRANSFER1");

        uint256 balance0 = IMockERC20(token0).balanceOf(address(this));
        uint256 balance1 = IMockERC20(token1).balanceOf(address(this));
        uint256 amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "INSUFFICIENT_INPUT");

        uint256 balance0Adjusted = balance0 * 1000 - amount0In * 3;
        uint256 balance1Adjusted = balance1 * 1000 - amount1In * 3;
        require(balance0Adjusted * balance1Adjusted >= uint256(_reserve0) * _reserve1 * 1_000_000, "K");
        _writeReserves(balance0, balance1);
    }

    function _writeReserves(uint256 balance0, uint256 balance1) private {
        require(balance0 <= type(uint112).max && balance1 <= type(uint112).max, "OVERFLOW");
        _reserve0 = uint112(balance0);
        _reserve1 = uint112(balance1);
    }

    function _sqrt(uint256 y) private pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}

contract MockUniswapV2Factory {
    mapping(address => mapping(address => address)) public getPair;

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "IDENTICAL");
        require(tokenA != address(0) && tokenB != address(0), "ZERO");
        require(getPair[tokenA][tokenB] == address(0), "EXISTS");
        pair = address(new MockUniswapV2Pair(tokenA, tokenB));
        getPair[tokenA][tokenB] = pair;
        getPair[tokenB][tokenA] = pair;
    }
}

contract MockUniswapV2Router {
    MockUniswapV2Factory public immutable factory;

    constructor(address factory_) {
        factory = MockUniswapV2Factory(factory_);
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        address to
    ) external returns (uint256 liquidity) {
        address pair = factory.getPair(tokenA, tokenB);
        require(pair != address(0), "PAIR");
        require(IMockERC20(tokenA).transferFrom(msg.sender, pair, amountA), "TRANSFER_A");
        require(IMockERC20(tokenB).transferFrom(msg.sender, pair, amountB), "TRANSFER_B");
        liquidity = MockUniswapV2Pair(pair).mint(to);
    }

    function swapExactTokensForTokens(uint256 amountIn, address[] calldata path, address to)
        external
        returns (uint256 amountOut)
    {
        require(path.length == 2, "PATH");
        address pair = factory.getPair(path[0], path[1]);
        require(pair != address(0), "PAIR");
        require(IMockERC20(path[0]).transferFrom(msg.sender, pair, amountIn), "TRANSFER_IN");

        MockUniswapV2Pair pool = MockUniswapV2Pair(pair);
        (uint112 reserve0, uint112 reserve1,) = pool.getReserves();
        bool inIsToken0 = path[0] == pool.token0();
        uint256 reserveIn = inIsToken0 ? reserve0 : reserve1;
        uint256 reserveOut = inIsToken0 ? reserve1 : reserve0;
        uint256 actualIn = IMockERC20(path[0]).balanceOf(pair) - reserveIn;
        amountOut = getAmountOut(actualIn, reserveIn, reserveOut);
        if (inIsToken0) {
            pool.swap(0, amountOut, to);
        } else {
            pool.swap(amountOut, 0, to);
        }
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) public pure returns (uint256) {
        require(amountIn > 0 && reserveIn > 0 && reserveOut > 0, "AMOUNT");
        uint256 amountInWithFee = amountIn * 997;
        return (amountInWithFee * reserveOut) / (reserveIn * 1000 + amountInWithFee);
    }
}
