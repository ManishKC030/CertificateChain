const API_KEY = import.meta.env.VITE_PINATA_API_KEY;
const API_SECRET = import.meta.env.VITE_PINATA_API_SECRET;

export async function uploadFileToPinata(file, metadata = {}) {
  if (!API_KEY || !API_SECRET) {
    throw new Error("Pinata API Keys are not configured in .env file");
  }

  console.log("Attempting Pinata FILE upload for:", file.name);

  try {
    const formData = new FormData();
    formData.append("file", file);

    const pinataMetadata = JSON.stringify({
      name: metadata.name || file.name,
      keyvalues: metadata.keyvalues || {}
    });
    formData.append("pinataMetadata", pinataMetadata);

    const response = await fetch(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      {
        method: "POST",
        headers: {
          pinata_api_key: API_KEY,
          pinata_secret_api_key: API_SECRET,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Pinata File API error (${response.status}):`, errorText);
      throw new Error(`File upload failed (${response.status}): ${response.statusText}`);
    }

    const result = await response.json();
    console.log("File upload successful! CID:", result.IpfsHash);
    return result.IpfsHash;
  } catch (error) {
    console.error("Detailed Pinata file upload error:", error);
    throw error;
  }
}

export async function uploadCertificateToPinata(data) {
  if (!API_KEY || !API_SECRET) {
    throw new Error("Pinata API Keys are not configured");
  }

  try {
    const payload = {
      pinataContent: data,
      pinataMetadata: {
        name: `Certificate Data: ${data.studentName} (${data.regNo})`,
      }
    };

    const response = await fetch(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          pinata_api_key: API_KEY,
          pinata_secret_api_key: API_SECRET,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`JSON upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.IpfsHash;
  } catch (error) {
    throw error;
  }
}
