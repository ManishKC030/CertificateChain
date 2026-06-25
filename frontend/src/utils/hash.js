import CryptoJS from "crypto-js";

/**
 * Generates a SHA-256 hash of a string (like JSON data)
 */
export function generateCertificateHash(studentData) {
  return CryptoJS.SHA256(
    JSON.stringify(studentData)
  ).toString();
}

/**
 * Generates a SHA-256 hash of a File object
 */
export async function generateFileHash(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target.result;
      const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer);
      const hash = CryptoJS.SHA256(wordArray).toString();
      resolve(hash);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}
