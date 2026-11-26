// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Calls a factory with value and cannot receive a refund.
contract RejectingCaller {
    function callFactory(address factory, bytes calldata data) external payable {
        (bool ok, bytes memory ret) = factory.call{value: msg.value}(data);
        if (!ok) {
            // solhint-disable-next-line no-inline-assembly
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }
}
