// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/Sameer.sol";
import "../src/CertificateRegistry.sol";

contract SameerTest is Test {

    CertificateRegistry registry;
    Sameer nft;

    address user = address(1);

    function setUp() public {
        registry = new CertificateRegistry();

        registry.issueCertificate(
            "Sameer",
            "REG123",
            "Blockchain",
            "A+",
            "HASH123",
            "ipfs://"
        );

        nft = new Sameer(address(this), address(registry));
    }

    function testMintNFT() public {
        nft.mintCertificateNFT(user, "HASH123");

        assertEq(nft.ownerOf(0), user);
    }

    function test_RevertInvalidHash() public {
    vm.expectRevert("Not found");

    nft.mintCertificateNFT(user, "WRONG_HASH");
}
}