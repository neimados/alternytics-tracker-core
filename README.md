# Alternytics - Core Tracker & Ingestion API

**Alternytics**, a privacy-first web analytics platform. 

At Alternytics, we believe that website owners should have access to powerful, actionable insights without compromising the privacy of their visitors. This repository serves as an open audit trail, allowing developers, Data Protection Officers (DPOs), and our users to inspect exactly how data is collected, processed, and anonymized before it ever reaches our databases.

## 🛡️ Our Privacy-First Commitment

Alternytics is built from the ground up to be fully compliant with GDPR, ePrivacy, PECR, and CCPA regulations. We achieve this through strict architectural constraints:

- **Zero Cookies:** We do not use cookies.
- **Zero Local Storage:** We do not store any data in the visitor's browser (`localStorage`, `sessionStorage`, or `IndexedDB`).
- **Zero Cross-Site Tracking:** We do not track users across different websites or devices.
- **Zero PII (Personally Identifiable Information):** We do not collect or store raw IP addresses.

## 🔍 What is in this repository?

This repository contains the exact reference code for our two most critical components regarding user privacy:

1. **The Client Script (`script.js`):** The lightweight JavaScript snippet that our customers embed on their websites.
2. **The Ingestion Route (`api/collect/route.ts`):** The server-side API endpoint that receives, anonymizes, and processes the incoming traffic.

## 🛑 Security Note: The Expurgated Anti-Bot Shield

In the `route.ts` file provided in this repository, you will notice that the `analyzeTraffic` function is empty. 

In the Alternytics production environment, this function contains our proprietary "Anti-Bot Shield" – a complex set of rules, referrer blacklists, and hardware-level velocity checks (Speed Traps). Publishing our exact filtering criteria would provide bad actors with a precise instruction manual to bypass our defenses. We have kept this specific logic private to protect the integrity of the analytics data.

If you are using this code for your own project, you can easily implement your own filtering logic inside the `analyzeTraffic` function.

## ⚙️ How Data is Processed & Anonymized

To provide accurate analytics (like unique visitor counts) without tracking individuals, we use a robust cryptographic hashing method.

When a pageview is triggered, the `script.js` sends basic, non-identifying telemetry (URL, referrer, screen resolution, browser language) to our `api/collect` endpoint. 

Upon receiving the request, our server immediately performs the following irreversible anonymization:
```javascript
// The IP address and User-Agent are NEVER stored in our database.
// They are combined with a daily rotating timestamp and a secret cryptographic salt.
const visitor_hash = crypto
  .createHash('sha256')
  .update(`${ip}-${userAgent}-${date}-${salt}`)
  .digest('hex');
