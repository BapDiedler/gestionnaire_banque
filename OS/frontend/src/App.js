import React, { useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { CSVLink } from 'react-csv';
import './App.css';

const MOCK_MODE = process.env.REACT_APP_MOCK_MODE === 'true';

const COLORS = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc949'];

function App() {
  const [linkToken, setLinkToken] = useState(null);
  const [accessToken, setAccessToken] = useState(localStorage.getItem('accessToken') || null);
  const [transactions, setTransactions] = useState([]);
  const [expandedTx, setExpandedTx] = useState(null);
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [darkMode, setDarkMode] = useState(false);

  // Plaid link token
  useEffect(() => {
  if (!MOCK_MODE) {
    fetch('http://localhost:3001/api/create_link_token', { method: 'POST' })
      .then(res => res.json())
      .then(data => setLinkToken(data.link_token))
      .catch(err => console.error('Erreur link token:', err));
  }
}, []); // Se déclenche seulement au premier rendu


  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (public_token) => {
      const res = await fetch("http://localhost:3001/api/exchange_public_token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token }),
      });
      const data = await res.json();

      // On reçoit maintenant uniquement un JWT sécurisé
      localStorage.setItem("jwt", data.jwt); // Stockage côté frontend
      setAccessToken(data.jwt); // On l’utilise pour les requêtes
    },
  });


  const logout = () => {
    setAccessToken(null);
    setTransactions([]);
    localStorage.removeItem('jwt');
  };

  const loadTransactions = async () => {
    // Récupérer le JWT stocké côté frontend
    const jwt = localStorage.getItem("jwt");
    if (!jwt) return alert("Veuillez vous reconnecter");

    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

    const res = await fetch(`${API_URL}/api/transactions`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });

    if (!res.ok) {
      alert("Erreur : impossible de récupérer les transactions");
      return;
    }

    const data = await res.json();
    setTransactions(data);
  };


  const filteredTransactions = transactions.filter(tx => {
    if (filterMonth !== 'all') {
      const txMonth = tx.date?.slice(0, 7);
      if (txMonth !== filterMonth) return false;
    }
    if (filterCategory !== 'all') {
      if (!tx.category?.includes(filterCategory)) return false;
    }
    if (filterSearch) {
      const text = filterSearch.toLowerCase();
      if (!(tx.name?.toLowerCase().includes(text) || tx.description?.toLowerCase().includes(text))) return false;
    }
    if (filterStart && tx.date < filterStart) return false;
    if (filterEnd && tx.date > filterEnd) return false;
    return true;
  });

  // Dashboard summary
  const totalExpenses = filteredTransactions.filter(tx => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const totalIncome = filteredTransactions.filter(tx => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
  const balance = totalIncome - totalExpenses;

  // Graph data
  const barData = filteredTransactions.reduce((acc, tx) => {
    const date = tx.date?.slice(0, 7) || 'Autres';
    const existing = acc.find(d => d.date === date);
    if (existing) existing.amount += tx.amount;
    else acc.push({ date, amount: tx.amount });
    return acc;
  }, []);

  const categoryData = Array.from(new Set(transactions.flatMap(tx => tx.category || [])))
    .map(cat => {
      const sum = filteredTransactions.filter(tx => tx.category?.includes(cat)).reduce((s, tx) => s + Math.abs(tx.amount), 0);
      return { name: cat, value: sum };
    });

  // Months for filter
  const months = Array.from(new Set(transactions.map(tx => tx.date?.slice(0, 7)))).filter(Boolean);

  // Categories for filter
  const categories = Array.from(new Set(transactions.flatMap(tx => tx.category || []))).filter(Boolean);

  return (
    <div className={`app-container ${darkMode ? 'dark' : ''}`}>
      <h1 className="title">Assistant Financier</h1>

      <div className="button-group">
        {!accessToken &&
          <button className="btn btn-primary"
            disabled={!ready && !MOCK_MODE}
            onClick={() => { if (MOCK_MODE) { setAccessToken('mock-access-token'); localStorage.setItem('accessToken', 'mock-access-token') } else if (ready) open(); }}
          >
            Connecter ma banque
          </button>
        }
        {accessToken &&
          <>
            <button className="btn btn-secondary" onClick={loadTransactions}>Voir mes transactions</button>
            <button className="btn btn-secondary" onClick={logout}>Déconnexion</button>
          </>
        }
        <button className="btn btn-secondary" onClick={() => setDarkMode(!darkMode)}>
          {darkMode ? 'Mode Clair' : 'Mode Sombre'}
        </button>
      </div>

      {accessToken && transactions.length > 0 && (
        <>
          {/* Filtres */}
          <div className="chart-filters">
            <input type="text" placeholder="Rechercher..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)} />
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
              <option value="all">Tous les mois</option>
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="all">Toutes catégories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} />
            <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} />
          </div>

          {/* Dashboard résumé */}
          <div className="dashboard-summary">
            <div>Solde: {balance.toFixed(2)}€</div>
            <div>Dépenses: {totalExpenses.toFixed(2)}€</div>
            <div>Revenus: {totalIncome.toFixed(2)}€</div>
            <CSVLink data={filteredTransactions} filename="transactions.csv" className="btn btn-secondary">Exporter CSV</CSVLink>
          </div>

          {/* Transactions */}
          <ul className="transactions-list">
            {filteredTransactions.map(tx => (
              <li key={tx.transaction_id} className={`transaction-card ${expandedTx === tx.transaction_id ? 'expanded' : ''}`}
                onClick={() => setExpandedTx(expandedTx === tx.transaction_id ? null : tx.transaction_id)}>
                <div className={`transaction-summary ${tx.amount > 0 ? 'positive' : 'negative'}`}>
                  {tx.name} – {tx.amount.toFixed(2)}€
                </div>
                {expandedTx === tx.transaction_id && (
                  <div className="transaction-details-inline">
                    <div>Date: {tx.date || 'N/A'}</div>
                    <div>Catégorie: {tx.category?.join(', ') || 'N/A'}</div>
                    <div>Institution: {tx.institution_name || 'Sandbox Bank'}</div>
                    <div>Description: {tx.description || 'N/A'}</div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Graphiques */}
          <div className="chart-wrapper">
            <h2>Transactions par mois</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="amount" fill="#4e79a7" animationDuration={500} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-wrapper">
            <h2>Répartition par catégorie</h2>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" outerRadius={80} fill="#8884d8" label>
                  {categoryData.map((entry, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

        </>
      )}
    </div>
  );
}

export default App;
