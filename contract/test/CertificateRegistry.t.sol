// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/CertificateRegistry.sol";

contract CertificateRegistryTest is Test {
    CertificateRegistry public registry;
    address public owner = address(1);
    address public admin = address(2);
    address public student = address(3);

    function setUp() public {
        vm.prank(owner);
        registry = new CertificateRegistry();
        vm.prank(owner);
        registry.addAdmin(admin);
    }

    function test_IssueCertificate() public {
        vm.prank(admin);
        registry.issueCertificate(
            "Sameer Dhakal",
            "BCT-2078-045",
            "Blockchain Engineering",
            "A+",
            "hash123",
            "ipfs123"
        );

        (
            string memory name,
            string memory regNo,
            ,
            ,
            string memory certHash,
            ,
            uint256 issuedAt,
            address issuer,
            bool revoked
        ) = registry.certificates("hash123");

        assertEq(name, "Sameer Dhakal");
        assertEq(regNo, "BCT-2078-045");
        assertEq(certHash, "hash123");
        assertEq(issuedAt, block.timestamp);
        assertEq(issuer, admin);
        assertFalse(revoked);
    }

    function test_VerifyCertificate() public {
        vm.prank(admin);
        registry.issueCertificate(
            "Sameer Dhakal",
            "BCT-2078-045",
            "Blockchain Engineering",
            "A+",
            "hash123",
            "ipfs123"
        );

        assertTrue(registry.verifyCertificate("hash123"));
    }

    function test_Revert_VerifyNonExistent() public {
        vm.expectRevert("Not found");
        registry.verifyCertificate("nonexistent");
    }

    function test_RevokeCertificate() public {
        vm.prank(admin);
        registry.issueCertificate(
            "Sameer Dhakal",
            "BCT-2078-045",
            "Blockchain Engineering",
            "A+",
            "hash123",
            "ipfs123"
        );

        vm.prank(admin);
        registry.revokeCertificate("hash123");

        (,,,,,,,, bool revoked) = registry.certificates("hash123");
        assertTrue(revoked);
    }

    function test_Revert_IssueDuplicate() public {
        vm.prank(admin);
        registry.issueCertificate("N1", "R1", "C1", "G1", "H1", "I1");
        
        vm.expectRevert("Exists");
        vm.prank(admin);
        registry.issueCertificate("N1", "R1", "C1", "G1", "H1", "I1");
    }
}
