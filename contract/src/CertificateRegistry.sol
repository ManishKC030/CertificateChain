// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

contract CertificateRegistry {
    
    address public owner;
    bool public paused;

    uint256 public totalCertificates;
    uint256 public totalAdmins;
    uint256 public totalRevokedCertificates;

    struct Certificate {
        string studentName;
        string registrationNumber;
        string course;
        string grade;
        string certificateHash;
        string ipfsHash;
        uint256 issuedAt;
        address issuer;
        bool revoked;
    }

    mapping(string => Certificate) public certificates;
    mapping(address => bool) public admins;

    constructor() {
        owner = msg.sender;
        admins[msg.sender] = true;
        totalAdmins = 1;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyAdmin() {
        require(admins[msg.sender], "Only admin");
        _;
    }

    modifier notPaused() {
        require(!paused, "Paused");
        _;
    }

    function addAdmin(address _admin) public onlyOwner {
        require(!admins[_admin], "Already admin");
        admins[_admin] = true;
        totalAdmins++;
    }

    function removeAdmin(address _admin) public onlyOwner {
        require(admins[_admin], "Not admin");
        admins[_admin] = false;
        totalAdmins--;
    }

    function issueCertificate(
        string memory _studentName,
        string memory _registrationNumber,
        string memory _course,
        string memory _grade,       
        string memory _certificateHash,
        string memory _ipfsHash
    ) public onlyAdmin notPaused {

        require(certificates[_certificateHash].issuedAt == 0, "Exists");

        certificates[_certificateHash] = Certificate({
            studentName: _studentName,
            registrationNumber: _registrationNumber,
            course: _course,
            grade: _grade,
            certificateHash: _certificateHash,
            ipfsHash: _ipfsHash,
            issuedAt: block.timestamp,
            issuer: msg.sender,
            revoked: false
        });

        totalCertificates++;
    }

    function verifyCertificate(string memory _certificateHash)
        public
        view
        returns (bool)
    {
        Certificate memory cert = certificates[_certificateHash];

        require(cert.issuedAt != 0, "Not found");
        require(!cert.revoked, "Revoked");

        return true;
    }

    function getCertificate(string memory _certificateHash)
        public
        view
        returns (Certificate memory)
    {
        return certificates[_certificateHash];
    }

    function revokeCertificate(string memory _certificateHash)
        public
        onlyAdmin
    {
        require(certificates[_certificateHash].issuedAt != 0, "Not found");
        require(!certificates[_certificateHash].revoked, "Already revoked");

        certificates[_certificateHash].revoked = true;
        totalRevokedCertificates++;
    }

    function pauseContract() public onlyOwner {
        paused = true;
    }

    function unpauseContract() public onlyOwner {
        paused = false;
    }

    function isAdmin(address _user) public view returns (bool) {
        return admins[_user];
    }
}