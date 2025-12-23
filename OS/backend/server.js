require('dotenv').config(); 

const MOCK_MODE = process.env.MOCK_MODE === 'true';
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');


const app = express();
app.use(cors());
app.use(bodyParser.json());

const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';

const ENV_URLS = {
  sandbox: PlaidEnvironments.sandbox,
  development: 'https://development.plaid.com', // parfois ne fonctionne pas
  production: PlaidEnvironments.production
};

const config = new Configuration({
  basePath: ENV_URLS[PLAID_ENV],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});


const plaidClient = new PlaidApi(config);

console.log('PLAID_ENV =', PLAID_ENV);
console.log('PLAID_CLIENT_ID =', process.env.PLAID_CLIENT_ID?.slice(0, 6));



app.post('/api/create_link_token', async (req, res) => {
    if (MOCK_MODE) {
        return res.json({ link_token: 'mock-link-token' });
    }

    try {
        const response = await plaidClient.linkTokenCreate({
            user: { client_user_id: 'user-id' },
            client_name: 'FinTech App',
            products: ['transactions'],
            country_codes: ['FR'],
            language: 'fr',
        });
        res.json(response.data);
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ error: 'Plaid error' });
    }
});

const jwt = require("jsonwebtoken");
const { encrypt } = require("./utils/crypto");

app.post("/api/exchange_public_token", async (req, res) => {
  if (MOCK_MODE) {
    // Retourne un JWT mock
    const jwtToken = jwt.sign({ userId: "mock-user" }, process.env.JWT_SECRET, { expiresIn: "7d" });
    global.userSession = { jwt: jwtToken, plaid_access_token: encrypt("mock-access-token") };
    return res.json({ jwt: jwtToken });
  }

  try {
    const { public_token } = req.body;

    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const accessToken = response.data.access_token;

    // 🔐 Chiffrement du token
    const encryptedToken = encrypt(accessToken);

    // 🧾 Génération du JWT pour le frontend
    const jwtToken = jwt.sign({ userId: "user-123" }, process.env.JWT_SECRET, { expiresIn: "7d" });

    // Stockage en mémoire (à remplacer par DB pour production)
    global.userSession = { jwt: jwtToken, plaid_access_token: encryptedToken };

    res.json({ jwt: jwtToken });

    console.log("Exchange response:", response.data);
    console.log("Received public_token:", public_token);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "Token exchange failed" });
  }
});

const { decrypt } = require("./utils/crypto");
const auth = require("./middleware/auth");

app.get("/api/transactions", auth, async (req, res) => {
  if (MOCK_MODE) {
    return res.json([
      { transaction_id: "1", name: "Carrefour", amount: 42.5, date: "2024-12-01", category: ["Groceries"] },
      { transaction_id: "2", name: "Netflix", amount: 15.99, date: "2024-12-03", category: ["Entertainment"] },
      { transaction_id: "3", name: "SNCF", amount: 67.2, date: "2024-12-05", category: ["Transport"] }
    ]);
  }

  try {
    const encryptedToken = global.userSession.plaid_access_token;
    const access_token = decrypt(encryptedToken);

    const today = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1); // 1 an de transactions

    const formatDate = (d) => d.toISOString().split("T")[0];

    const response = await plaidClient.transactionsGet({
      access_token,
      start_date: formatDate(startDate),
      end_date: formatDate(today),
    });

    console.log("Transactions returned:", response.data.transactions.length);

    res.json(response.data.transactions);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "Transactions fetch failed" });
  }
});





app.listen(3001, () => console.log('Backend running on port 3001'));