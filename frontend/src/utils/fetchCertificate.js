export async function fetchCertificateFromIPFS(cid) {
  const response = await fetch(
    `https://gateway.pinata.cloud/ipfs/${cid}`
  );

  return await response.json();
}