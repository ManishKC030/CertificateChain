import { useState, useEffect } from "react";
import { ethers, BrowserProvider, Contract } from "ethers";

import registryJson from "./abi/CertificateRegistry.json";
import sameerJson from "./abi/Sameer.json";
import { generateFileHash } from "./utils/hash";
import { uploadFileToPinata } from "./utils/pinata";

// REGISTRY_ADDRESS is the core contract where certificates are stored
const REGISTRY_ADDRESS = "0x871086DA3fA39378DDaaae6c2CA79ec1bac5a92C";
// SAMEER_ADDRESS is the NFT contract (Newly redeployed)
const SAMEER_ADDRESS = "0x3ff7bF2CC03fa79eFd17F19FeeE03Dc0E0973dcA";

const REGISTRY_ABI = registryJson.abi || registryJson;
const SAMEER_ABI = sameerJson.abi || sameerJson;

export default function App() {
  const [account, setAccount] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");

  const [form, setForm] = useState({
    studentName: "",
    regNo: "",
    course: "",
    grade: "",
    studentAddress: "",
  });

  const [issueFile, setIssueFile] = useState(null);
  const [issueHash, setIssueHash] = useState("");
  const [verifyFile, setVerifyFile] = useState(null);
  const [generatedVerifyHash, setGeneratedVerifyHash] = useState("");

  const [verifyHash, setVerifyHash] = useState("");
  const [result, setResult] = useState("");
  const [certificateData, setCertificateData] = useState(null);
  const [issued, setIssued] = useState(null);
  const [isIssuing, setIsIssuing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [myCertificates, setMyCertificates] = useState([]);
  const [isLoadingMyCerts, setIsLoadingMyCerts] = useState(false);
  const [activeTab, setActiveTab] = useState("verify"); // "verify" or "mycerts"

  // Auto-generate hash when file is selected for issuance
  useEffect(() => {
    if (issueFile) {
      generateFileHash(issueFile).then(setIssueHash);
    } else {
      setIssueHash("");
    }
  }, [issueFile]);

  // Auto-generate hash when file is selected for verification
  useEffect(() => {
    if (verifyFile) {
      generateFileHash(verifyFile).then(setGeneratedVerifyHash);
    } else {
      setGeneratedVerifyHash("");
    }
  }, [verifyFile]);

  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    if (window.ethereum) {
      // Check initial account
      window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
        if (accounts.length > 0) {
          const acc = accounts[0];
          setAccount(acc);
          checkAdminStatus(acc);
          fetchMyCertificates(acc);
        }
      });

      window.ethereum.on("accountsChanged", (accounts) => {
        const newAccount = accounts[0] || "";
        setAccount(newAccount);
        if (newAccount) {
          checkAdminStatus(newAccount);
          fetchMyCertificates(newAccount);
        } else {
          setIsAdmin(false);
          setMyCertificates([]);
        }
      });
    }
  }, []);

  const fetchMyCertificates = async (userAddr) => {
    if (!userAddr) return;
    try {
      setIsLoadingMyCerts(true);
      const registry = await getContract(REGISTRY_ADDRESS, REGISTRY_ABI);
      const sameer = await getContract(SAMEER_ADDRESS, SAMEER_ABI);

      // Fetch all Transfer events to the user (to find token IDs)
      const filter = sameer.filters.Transfer(null, userAddr);
      const events = await sameer.queryFilter(filter);

      const certs = await Promise.all(
        events.map(async (event) => {
          const tokenId = event.args[2];
          const certHash = await sameer.certificateHash(tokenId);
          const cert = await registry.getCertificate(certHash);
          return {
            tokenId: tokenId.toString(),
            studentName: cert.studentName,
            regNo: cert.registrationNumber,
            course: cert.course,
            grade: cert.grade,
            certificateHash: cert.certificateHash,
            ipfsHash: cert.ipfsHash,
            issuedAt: Number(cert.issuedAt) * 1000,
          };
        }),
      );

      setMyCertificates(certs.sort((a, b) => b.issuedAt - a.issuedAt));
    } catch (err) {
      console.error("Error fetching my certificates:", err);
    } finally {
      setIsLoadingMyCerts(false);
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  const checkAdminStatus = async (addr) => {
    try {
      console.log("Checking admin status for:", addr);
      const contract = await getContract(REGISTRY_ADDRESS, REGISTRY_ABI);

      let status = false;
      try {
        status = await contract.isAdmin(addr);
      } catch (e) {
        console.warn(
          "isAdmin() call failed, trying admins mapping:",
          e.message,
        );
        try {
          status = await contract.admins(addr);
        } catch (e2) {
          console.error(
            "Both isAdmin() and admins mapping failed. Check if REGISTRY_ADDRESS is correct.",
          );
        }
      }

      console.log("Admin status result:", status);
      setIsAdmin(!!status);
    } catch (err) {
      console.error("Critical Admin Check Error:", err);
      setIsAdmin(false);
    }
  };

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert("Please install MetaMask!");
        return;
      }
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      await checkAdminStatus(accounts[0]);
      await fetchMyCertificates(accounts[0]);
    } catch (err) {
      console.error("Connection error:", err);
    }
  };

  const getContract = async (address, abi) => {
    if (!window.ethereum) throw new Error("MetaMask is not installed");
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return new Contract(address, abi, signer);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const issueCertificate = async () => {
    try {
      if (
        !form.studentName ||
        !form.regNo ||
        !form.course ||
        !form.grade ||
        !form.studentAddress ||
        !issueFile
      ) {
        alert("Please fill all fields and upload a file ✍️");
        return;
      }

      if (!ethers.isAddress(form.studentAddress)) {
        alert("Invalid student wallet address ❌");
        return;
      }

      setIsIssuing(true);
      const registry = await getContract(REGISTRY_ADDRESS, REGISTRY_ABI);
      const sameer = await getContract(SAMEER_ADDRESS, SAMEER_ABI);

      const certHash = issueHash || (await generateFileHash(issueFile));
      const ipfsHash = await uploadFileToPinata(issueFile, {
        name: `Cert: ${form.studentName}`,
        keyvalues: { student: form.studentName, reg: form.regNo },
      });

      // 1. Register in Registry
      console.log("Step 1: Registering certificate in Registry...");
      const tx1 = await registry.issueCertificate(
        form.studentName,
        form.regNo,
        form.course,
        form.grade,
        certHash,
        ipfsHash,
      );
      await tx1.wait();

      // 2. Mint Soulbound NFT
      console.log("Step 2: Minting Soulbound NFT...");
      let nftSuccess = false;
      try {
        const tx2 = await sameer.mintCertificateNFT(
          form.studentAddress,
          certHash,
        );
        await tx2.wait();
        nftSuccess = true;
      } catch (nftErr) {
        console.error("NFT Minting failed:", nftErr);
      }

      setIssued({ certHash, ipfsHash, nftSuccess });
      setForm({
        studentName: "",
        regNo: "",
        course: "",
        grade: "",
        studentAddress: "",
      });
      setIssueFile(null);
      setIssueHash("");
      alert("Success! Certificate and Soulbound NFT processed. ✅");
      fetchMyCertificates(account);
    } catch (err) {
      console.error("Issuance Error:", err);
      alert(err?.reason || err?.message || "Transaction Failed");
    } finally {
      setIsIssuing(false);
    }
  };

  const verifyCertificate = async () => {
    try {
      let hashToVerify = verifyHash;
      if (verifyFile) {
        setIsVerifying(true);
        hashToVerify =
          generatedVerifyHash || (await generateFileHash(verifyFile));
      }

      if (!hashToVerify) {
        alert("Please enter a hash or upload a file");
        return;
      }

      setIsVerifying(true);
      const registry = await getContract(REGISTRY_ADDRESS, REGISTRY_ABI);
      const sameer = await getContract(SAMEER_ADDRESS, SAMEER_ABI);

      const valid = await registry.verifyCertificate(hashToVerify);

      if (!valid) {
        setResult("INVALID ❌");
        setCertificateData(null);
        return;
      }

      const cert = await registry.getCertificate(hashToVerify);
      const nftMinted = await sameer.minted(hashToVerify);

      setCertificateData({
        studentName: cert.studentName,
        regNo: cert.registrationNumber,
        course: cert.course,
        grade: cert.grade,
        certificateHash: cert.certificateHash,
        ipfsHash: cert.ipfsHash,
        nftStatus: nftMinted ? "MINTED 🔥" : "NOT MINTED",
      });
      setResult("VALID CERTIFICATE ✅");
    } catch (err) {
      console.error(err);
      setResult("NOT FOUND ❌");
      setCertificateData(null);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen pb-20 transition-colors duration-300">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">🎓</span>
            <span className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">
              Certi<span className="text-primary">Chain</span>
            </span>
            {account && (
              <span
                className={`role-badge ml-3 ${isAdmin ? "role-badge-admin" : "role-badge-user"}`}
              >
                {isAdmin ? "Admin" : "Public User"}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-6">
            <div className="hidden md:flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab("verify")}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === "verify" ? "bg-white dark:bg-slate-700 text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Verify
              </button>
              <button
                onClick={() => setActiveTab("mycerts")}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === "mycerts" ? "bg-white dark:bg-slate-700 text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                My Credentials{" "}
                {myCertificates.length > 0 && `(${myCertificates.length})`}
              </button>
            </div>

            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
            >
              {theme === "light" ? "🌙" : "☀️"}
            </button>

            <button
              onClick={connectWallet}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-full font-medium transition-all ${
                account
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  : "bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/20"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${account ? "bg-accent animate-pulse" : "bg-white/50"}`}
              ></span>
              <span className="hidden sm:inline">
                {account
                  ? `${account.slice(0, 6)}...${account.slice(-4)}`
                  : "Connect Wallet"}
              </span>
              <span className="sm:hidden">
                {account ? "Connected" : "Connect"}
              </span>
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 pt-12">
        {/* Hero Section */}
        <section className="text-center mb-16 space-y-4">
          <h2 className="text-4xl md:text-6xl font-black tracking-tight text-slate-900 dark:text-white leading-tight">
            <span className="gradient-text">Immutable Academic Proof</span>
          </h2>
          <p className="text-base md:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto px-4 font-medium">
            Secure, verifiable, and permanent certificates powered by Ethereum
            and IPFS.
          </p>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Left Column: Issue (Admin) or MyCertificates (User) */}
          <div className="space-y-6">
            {isAdmin && (
              <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-600/20 flex items-center justify-center text-white">
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100">
                      Issuer Console
                    </h3>
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                      Authorized Management
                    </p>
                  </div>
                </div>

                <div className="glass-card p-8 md:p-10 rounded-[2.5rem] space-y-8 border-slate-200/60">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[
                      {
                        label: "Student Name",
                        name: "studentName",
                        placeholder: "e.g. Sameer Dhakal",
                      },
                      {
                        label: "Registration ID",
                        name: "regNo",
                        placeholder: "e.g. GUST3030",
                      },
                      {
                        label: "Course Title",
                        name: "course",
                        placeholder: "e.g. BSc.CSIT",
                      },
                      { label: "Grade", name: "grade", placeholder: "e.g. B+" },
                      {
                        label: "Student Wallet Address",
                        name: "studentAddress",
                        placeholder: "0x...",
                      },
                    ].map((field) => (
                      <div
                        key={field.name}
                        className={`space-y-1 ${field.name === "studentAddress" ? "md:col-span-2" : ""}`}
                      >
                        <label className="label-text">{field.label}</label>
                        <input
                          name={field.name}
                          value={form[field.name]}
                          onChange={handleChange}
                          placeholder={field.placeholder}
                          className="input-field"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1">
                    <label className="label-text">Certificate Document</label>
                    <div className="relative group">
                      <input
                        type="file"
                        onChange={(e) => setIssueFile(e.target.files[0])}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className="p-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/50 group-hover:border-primary group-hover:bg-primary/5 transition-all flex items-center justify-center space-x-3">
                        <svg
                          className="w-5 h-5 text-slate-500 group-hover:text-primary"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
                        </svg>
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-primary truncate max-w-[200px]">
                          {issueFile ? issueFile.name : "Select Document"}
                        </span>
                      </div>
                    </div>
                    {issueHash && (
                      <p className="mt-2 text-[10px] text-slate-500 font-mono bg-slate-100 dark:bg-slate-800/50 p-2 rounded-lg break-all">
                        <span className="font-black uppercase mr-2">
                          Generated Hash:
                        </span>{" "}
                        {issueHash}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={issueCertificate}
                    disabled={isIssuing}
                    className="btn-primary w-full py-4 text-lg"
                  >
                    {isIssuing ? "Processing..." : "Issue & Mint NFT"}
                  </button>

                  {issued && (
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-2xl animate-in zoom-in-95 space-y-2">
                      <p className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center text-xs uppercase tracking-widest">
                        <svg
                          className="w-4 h-4 mr-1.5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {issued.nftSuccess
                          ? "Success: Registry Updated & NFT Minted"
                          : "Partial Success: Registry Updated"}
                      </p>
                      <div className="text-[10px] text-slate-500 break-all bg-white/50 dark:bg-black/20 p-2 rounded-lg">
                        <b>Hash:</b> {issued.certHash}
                      </div>
                      <a
                        href={`https://gateway.pinata.cloud/ipfs/${issued.ipfsHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary font-bold hover:underline inline-flex items-center"
                      >
                        Verify Document on IPFS ↗
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!isAdmin && activeTab === "mycerts" && (
              <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-600/20 flex items-center justify-center text-white">
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100">
                      My Credentials
                    </h3>
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                      Your Soulbound Identity
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {isLoadingMyCerts ? (
                    <div className="glass-card p-12 rounded-[2.5rem] flex flex-col items-center justify-center space-y-4">
                      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-sm font-bold text-slate-500">
                        Scanning blockchain for your badges...
                      </p>
                    </div>
                  ) : myCertificates.length > 0 ? (
                    myCertificates.map((cert) => (
                      <div
                        key={cert.tokenId}
                        className="glass-card p-6 rounded-3xl space-y-4 hover:border-primary/50 transition-all group"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-lg font-black text-slate-900 dark:text-white leading-none">
                              {cert.course}
                            </h4>
                            <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-wider">
                              {cert.studentName} • {cert.regNo}
                            </p>
                          </div>
                          <span className="px-3 py-1 bg-accent text-white rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg shadow-accent/20">
                            Token #{cert.tokenId}
                          </span>
                        </div>
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <p className="text-[10px] text-slate-400 font-medium">
                            Issued on{" "}
                            {new Date(cert.issuedAt).toLocaleDateString()}
                          </p>
                          <div className="flex space-x-2">
                            <a
                              href={`https://sepolia.etherscan.io/token/${SAMEER_ADDRESS}?a=${cert.tokenId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] font-black uppercase text-indigo-600 hover:underline"
                            >
                              Explorer ↗
                            </a>
                            <a
                              href={`https://gateway.pinata.cloud/ipfs/${cert.ipfsHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] font-black uppercase text-emerald-600 hover:underline"
                            >
                              IPFS ↗
                            </a>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="glass-card p-12 rounded-[2.5rem] text-center space-y-4">
                      <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-3xl">
                        📭
                      </div>
                      <h4 className="text-xl font-bold">No Badges Found</h4>
                      <p className="text-sm text-slate-500">
                        You haven't received any soulbound certificates yet.
                        Once issued, they will appear here automatically.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!isAdmin && activeTab === "verify" && (
              <div className="lg:flex items-center justify-center p-12 text-center glass-card rounded-[2.5rem] animate-in fade-in duration-700 min-h-[400px]">
                <div className="max-w-xs space-y-6">
                  <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-4xl shadow-inner">
                    🛡️
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-2">
                      Verification Portal
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                      Use the protocol on the right to verify any digital
                      certificate against the Ethereum mainnet registry.
                    </p>
                  </div>
                  <div className="pt-6 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-4">
                    <div className="text-left">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Network
                      </p>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Sepolia Testnet
                      </p>
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Standard
                      </p>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        ERC-721 SBT
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Verify Section */}
          <div className="space-y-6">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 shadow-lg shadow-emerald-600/20 flex items-center justify-center text-white">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.040L3 5.618a11.955 11.955 0 0112 21.382 11.955 11.955 0 018.618-15.764z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100">
                  Audit Protocol
                </h3>
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                  Public Verification Engine
                </p>
              </div>
            </div>

            <div className="glass-card p-8 md:p-10 rounded-[2.5rem] space-y-8">
              <div className="space-y-4">
                <div className="relative group cursor-pointer space-y-1">
                  <label className="label-text">
                    Option 1: Verify via Original File
                  </label>
                  <input
                    type="file"
                    onChange={(e) => {
                      setVerifyFile(e.target.files[0]);
                      setVerifyHash("");
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="p-8 border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-900/30 flex flex-col items-center justify-center text-center transition-all group-hover:bg-slate-100 dark:group-hover:bg-slate-800/50">
                    <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center mb-3">
                      <svg
                        className="w-6 h-6 text-slate-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                        />
                      </svg>
                    </div>
                    <p className="text-slate-800 dark:text-slate-300 font-bold">
                      {verifyFile
                        ? verifyFile.name
                        : "Drag certificate file here"}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-black">
                      Digital Fingerprint Analysis
                    </p>
                  </div>
                  {generatedVerifyHash && (
                    <p className="text-[9px] text-slate-400 font-mono mt-2 break-all px-2">
                      <span className="font-bold">Calculated Hash:</span>{" "}
                      {generatedVerifyHash}
                    </p>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase">
                    <span className="bg-white dark:bg-slate-900 px-3 text-slate-400 dark:text-slate-600 font-black tracking-widest">
                      or
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="label-text">
                    Option 2: Verify via Blockchain Hash
                  </label>
                  <input
                    value={verifyHash}
                    onChange={(e) => {
                      setVerifyHash(e.target.value);
                      setVerifyFile(null);
                      setGeneratedVerifyHash("");
                    }}
                    placeholder="Enter SHA256 string..."
                    className="input-field"
                  />
                </div>
              </div>

              <button
                onClick={verifyCertificate}
                disabled={isVerifying}
                className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-2xl hover:bg-slate-800 dark:hover:bg-slate-200 transition-all shadow-xl shadow-slate-200 dark:shadow-none"
              >
                {isVerifying ? "Scanning Blockchain..." : "Verify Authenticity"}
              </button>

              {result && (
                <div
                  className={`p-4 rounded-2xl flex items-center space-x-3 animate-in zoom-in-95 ${
                    result.includes("VALID")
                      ? "bg-accent/10 text-accent border border-accent/20"
                      : "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-500/20"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${result.includes("VALID") ? "bg-accent text-white" : "bg-rose-500 text-white"}`}
                  >
                    {result.includes("VALID") ? "✓" : "!"}
                  </div>
                  <span className="font-bold text-lg">{result}</span>
                </div>
              )}

              {certificateData && (
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm animate-in fade-in zoom-in-95">
                  <div className="bg-slate-50 dark:bg-slate-800/50 px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Credential Metadata
                    </span>
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${certificateData.nftStatus.includes("MINTED") ? "bg-accent text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-500"}`}
                      >
                        Soulbound {certificateData.nftStatus}
                      </span>
                    </div>
                  </div>
                  <div className="p-5 md:p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: "Student", val: certificateData.studentName },
                        { label: "Reg No", val: certificateData.regNo },
                        { label: "Course", val: certificateData.course },
                        { label: "Achievement", val: certificateData.grade },
                      ].map((item) => (
                        <div key={item.label}>
                          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                            {item.label}
                          </p>
                          <p className="font-bold text-slate-800 dark:text-white truncate">
                            {item.val}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="pt-4 border-t border-slate-50 dark:border-slate-800 flex flex-col space-y-3">
                      <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-800/50">
                        <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">
                          Blockchain Digital Fingerprint
                        </p>
                        <p className="text-[10px] font-mono text-slate-600 dark:text-slate-300 break-all leading-relaxed">
                          {certificateData.certificateHash}
                        </p>
                      </div>
                      <a
                        href={`https://gateway.pinata.cloud/ipfs/${certificateData.ipfsHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secondary py-3 px-4 text-xs flex items-center justify-center w-full"
                      >
                        Download Source Document ↗
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
