//update package.json with "type":"module" before running this script
import cryptoRandomString from 'crypto-random-string';

// Generate company Id
const companyId = cryptoRandomString({length: 8, type: 'distinguishable'});
console.log(companyId);
