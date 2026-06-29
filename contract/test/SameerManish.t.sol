// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/Sameer.sol";
import "../src/CertificateRegistry.sol";

contract SameerFullTest is Test {
    CertificateRegistry public registry;
    Sameer public nft;

    address public deployer = address(this);
    address public student = address(10);
    address public student2 = address(11);
    address public nobody = address(12);

    function setUp() public {
        // Deploy registry (this contract is the deployer/owner/admin)
        registry = new CertificateRegistry();

        // Issue a certificate so we can mint against it
        registry.issueCertificate("Alice", "REG001", "CS", "A", "HASH1", "ipfs://1");
        registry.issueCertificate("Bob", "REG002", "Math", "B", "HASH2", "ipfs://2");

        // Deploy NFT contract with this contract as owner
        nft = new Sameer(deployer, address(registry));
    }

    // ===== Constructor =====

    function test_NameIsCorrect() public view {
        assertEq(nft.name(), "Certificate Badge");
    }

    function test_SymbolIsCorrect() public view {
        assertEq(nft.symbol(), "CBADGE");
    }

    function test_RegistryAddressIsSet() public view {
        assertEq(nft.registryAddress(), address(registry));
    }

    function test_OwnerIsSet() public view {
        assertEq(nft.owner(), deployer);
    }

    // ===== mintCertificateNFT =====

    function test_MintSuccessfully() public {
        uint256 tokenId = nft.mintCertificateNFT(student, "HASH1");
        assertEq(tokenId, 0);
        assertEq(nft.ownerOf(0), student);
    }

    function test_MintSetsCertificateHash() public {
        nft.mintCertificateNFT(student, "HASH1");
        assertEq(nft.certificateHash(0), "HASH1");
    }

    function test_MintMarksMinted() public {
        nft.mintCertificateNFT(student, "HASH1");
        assertTrue(nft.minted("HASH1"));
    }

    function test_MintMultipleIncrementsTokenId() public {
        uint256 id1 = nft.mintCertificateNFT(student, "HASH1");
        uint256 id2 = nft.mintCertificateNFT(student2, "HASH2");
        assertEq(id1, 0);
        assertEq(id2, 1);
    }

    function test_Revert_MintDuplicateHash() public {
        nft.mintCertificateNFT(student, "HASH1");

        vm.expectRevert("Already minted");
        nft.mintCertificateNFT(student2, "HASH1");
    }

    function test_Revert_MintInvalidHash() public {
        vm.expectRevert("Not found");
        nft.mintCertificateNFT(student, "INVALID");
    }

    function test_Revert_MintRevokedCertificate() public {
        registry.revokeCertificate("HASH1");

        vm.expectRevert("Revoked");
        nft.mintCertificateNFT(student, "HASH1");
    }

    function test_Revert_NonOwnerCannotMint() public {
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nobody));
        vm.prank(nobody);
        nft.mintCertificateNFT(student, "HASH1");
    }

    // ===== Soulbound (non-transferable) =====

    function test_Revert_CannotTransferNFT() public {
        nft.mintCertificateNFT(student, "HASH1");

        vm.expectRevert("Soulbound NFT: non-transferable");
        vm.prank(student);
        nft.transferFrom(student, student2, 0);
    }
}
