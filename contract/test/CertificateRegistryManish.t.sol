// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/CertificateRegistry.sol";

contract CertificateRegistryFullTest is Test {
    CertificateRegistry public registry;
    address public owner = address(1);
    address public admin = address(2);
    address public nobody = address(3);

    function setUp() public {
        vm.prank(owner);
        registry = new CertificateRegistry();
    }

    // ===== Helper =====
    function _issue(address caller, string memory hash) internal {
        vm.prank(caller);
        registry.issueCertificate("Alice", "REG001", "CS", "A", hash, "ipfs://test");
    }

    // ===== Constructor =====

    function test_OwnerIsSet() public view {
        assertEq(registry.owner(), owner);
    }

    function test_DeployerIsAdmin() public view {
        assertTrue(registry.admins(owner));
    }

    function test_TotalAdminsStartsAtOne() public view {
        assertEq(registry.totalAdmins(), 1);
    }

    function test_InitialCountersZero() public view {
        assertEq(registry.totalCertificates(), 0);
        assertEq(registry.totalRevokedCertificates(), 0);
        assertFalse(registry.paused());
    }

    // ===== addAdmin =====

    function test_OwnerCanAddAdmin() public {
        vm.prank(owner);
        registry.addAdmin(admin);
        assertTrue(registry.admins(admin));
        assertEq(registry.totalAdmins(), 2);
    }

    function test_Revert_NonOwnerCannotAddAdmin() public {
        vm.expectRevert("Only owner");
        vm.prank(nobody);
        registry.addAdmin(admin);
    }

    function test_Revert_AddAlreadyAdmin() public {
        vm.prank(owner);
        registry.addAdmin(admin);

        vm.expectRevert("Already admin");
        vm.prank(owner);
        registry.addAdmin(admin);
    }

    // ===== removeAdmin =====

    function test_OwnerCanRemoveAdmin() public {
        vm.prank(owner);
        registry.addAdmin(admin);

        vm.prank(owner);
        registry.removeAdmin(admin);
        assertFalse(registry.admins(admin));
        assertEq(registry.totalAdmins(), 1);
    }

    function test_Revert_NonOwnerCannotRemoveAdmin() public {
        vm.prank(owner);
        registry.addAdmin(admin);

        vm.expectRevert("Only owner");
        vm.prank(nobody);
        registry.removeAdmin(admin);
    }

    function test_Revert_RemoveNonAdmin() public {
        vm.expectRevert("Not admin");
        vm.prank(owner);
        registry.removeAdmin(nobody);
    }

    // ===== issueCertificate =====

    function test_AdminCanIssueCertificate() public {
        vm.prank(owner);
        registry.addAdmin(admin);

        vm.prank(admin);
        registry.issueCertificate("Alice", "REG001", "CS", "A", "hash1", "ipfs1");

        (
            string memory name,
            string memory regNo,
            string memory course,
            string memory grade,
            string memory certHash,
            string memory ipfsHash,
            uint256 issuedAt,
            address issuer,
            bool revoked
        ) = registry.certificates("hash1");

        assertEq(name, "Alice");
        assertEq(regNo, "REG001");
        assertEq(course, "CS");
        assertEq(grade, "A");
        assertEq(certHash, "hash1");
        assertEq(ipfsHash, "ipfs1");
        assertEq(issuedAt, block.timestamp);
        assertEq(issuer, admin);
        assertFalse(revoked);
        assertEq(registry.totalCertificates(), 1);
    }

    function test_OwnerCanIssueCertificate() public {
        _issue(owner, "hash1");
        assertEq(registry.totalCertificates(), 1);
    }

    function test_Revert_NonAdminCannotIssue() public {
        vm.expectRevert("Only admin");
        vm.prank(nobody);
        registry.issueCertificate("Alice", "REG001", "CS", "A", "hash1", "ipfs1");
    }

    function test_Revert_DuplicateCertificateHash() public {
        _issue(owner, "hash1");

        vm.expectRevert("Exists");
        vm.prank(owner);
        registry.issueCertificate("Bob", "REG002", "Math", "B", "hash1", "ipfs2");
    }

    function test_Revert_IssueWhenPaused() public {
        vm.prank(owner);
        registry.pauseContract();

        vm.expectRevert("Paused");
        _issue(owner, "hash1");
    }

    function test_MultipleCertificatesIncrementCounter() public {
        _issue(owner, "h1");
        _issue(owner, "h2");
        _issue(owner, "h3");
        assertEq(registry.totalCertificates(), 3);
    }

    // ===== verifyCertificate =====

    function test_VerifyValidCertificate() public {
        _issue(owner, "hash1");
        assertTrue(registry.verifyCertificate("hash1"));
    }

    function test_Revert_VerifyNonExistent() public {
        vm.expectRevert("Not found");
        registry.verifyCertificate("nope");
    }

    function test_Revert_VerifyRevokedCertificate() public {
        _issue(owner, "hash1");

        vm.prank(owner);
        registry.revokeCertificate("hash1");

        vm.expectRevert("Revoked");
        registry.verifyCertificate("hash1");
    }

    // ===== getCertificate =====

    function test_GetCertificateReturnsCorrectData() public {
        _issue(owner, "hash1");

        CertificateRegistry.Certificate memory cert = registry.getCertificate("hash1");
        assertEq(cert.studentName, "Alice");
        assertEq(cert.registrationNumber, "REG001");
        assertEq(cert.course, "CS");
        assertEq(cert.grade, "A");
        assertEq(cert.certificateHash, "hash1");
        assertEq(cert.ipfsHash, "ipfs://test");
        assertFalse(cert.revoked);
    }

    function test_GetNonExistentReturnsEmpty() public view {
        CertificateRegistry.Certificate memory cert = registry.getCertificate("nope");
        assertEq(cert.issuedAt, 0);
        assertEq(bytes(cert.studentName).length, 0);
    }

    // ===== revokeCertificate =====

    function test_AdminCanRevoke() public {
        _issue(owner, "hash1");

        vm.prank(owner);
        registry.revokeCertificate("hash1");

        (,,,,,,,, bool revoked) = registry.certificates("hash1");
        assertTrue(revoked);
        assertEq(registry.totalRevokedCertificates(), 1);
    }

    function test_Revert_NonAdminCannotRevoke() public {
        _issue(owner, "hash1");

        vm.expectRevert("Only admin");
        vm.prank(nobody);
        registry.revokeCertificate("hash1");
    }

    function test_Revert_RevokeNonExistent() public {
        vm.expectRevert("Not found");
        vm.prank(owner);
        registry.revokeCertificate("nope");
    }

    function test_Revert_RevokeAlreadyRevoked() public {
        _issue(owner, "hash1");

        vm.prank(owner);
        registry.revokeCertificate("hash1");

        vm.expectRevert("Already revoked");
        vm.prank(owner);
        registry.revokeCertificate("hash1");
    }

    // ===== pause / unpause =====

    function test_OwnerCanPause() public {
        vm.prank(owner);
        registry.pauseContract();
        assertTrue(registry.paused());
    }

    function test_OwnerCanUnpause() public {
        vm.prank(owner);
        registry.pauseContract();
        vm.prank(owner);
        registry.unpauseContract();
        assertFalse(registry.paused());
    }

    function test_Revert_NonOwnerCannotPause() public {
        vm.expectRevert("Only owner");
        vm.prank(nobody);
        registry.pauseContract();
    }

    function test_Revert_NonOwnerCannotUnpause() public {
        vm.prank(owner);
        registry.pauseContract();

        vm.expectRevert("Only owner");
        vm.prank(nobody);
        registry.unpauseContract();
    }

    function test_CanIssueAfterUnpause() public {
        vm.prank(owner);
        registry.pauseContract();
        vm.prank(owner);
        registry.unpauseContract();

        _issue(owner, "hash1");
        assertEq(registry.totalCertificates(), 1);
    }

    // ===== isAdmin =====

    function test_IsAdminTrueForAdmin() public view {
        assertTrue(registry.isAdmin(owner));
    }

    function test_IsAdminFalseForNonAdmin() public view {
        assertFalse(registry.isAdmin(nobody));
    }
}
