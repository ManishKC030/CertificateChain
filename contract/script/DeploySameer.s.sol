// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Script.sol";
import "../src/Sameer.sol";

contract DeploySameer is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address registry = vm.envAddress("REGISTRY_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        Sameer nft = new Sameer(
            vm.addr(deployerPrivateKey),
            registry
        );

        vm.stopBroadcast();

        console.log("Sameer NFT deployed at:", address(nft));
    }
}