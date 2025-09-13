import React, { useState, useEffect } from 'react';
import axios from 'axios';
// Make sure your style.css is in the src folder
import './style.css'; 

// Main App Component
const App = () => {
  const [view, setView] = useState('events');
  // State to store the user's wallet address
  const [currentAccount, setCurrentAccount] = useState(null);

  // This function checks if a wallet is connected when the app loads
  const checkIfWalletIsConnected = async () => {
    try {
      // First make sure we have access to window.ethereum
      const { ethereum } = window;

      if (!ethereum) {
        console.log("Make sure you have MetaMask!");
        return;
      } else {
        console.log("We have the ethereum object", ethereum);
      }

      // Check if we're authorized to access the user's wallet
      const accounts = await ethereum.request({ method: 'eth_accounts' });

      if (accounts.length !== 0) {
        const account = accounts[0];
        console.log("Found an authorized account:", account);
        setCurrentAccount(account);
      } else {
        console.log("No authorized account found");
      }
    } catch (error) {
      console.error(error);
    }
  };

  // The main function to connect the wallet
  const connectWallet = async () => {
    try {
      const { ethereum } = window;

      if (!ethereum) {
        alert("Get MetaMask!");
        return;
      }

      // Request access to the user's accounts
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });

      console.log("Connected", accounts[0]);
      setCurrentAccount(accounts[0]);
    } catch (error) {
      console.log(error);
    }
  };
  
  // This runs our function when the page loads.
  // It also sets up a listener for account changes.
  useEffect(() => {
    checkIfWalletIsConnected();

    const handleAccountsChanged = (accounts) => {
        if (accounts.length > 0) {
            setCurrentAccount(accounts[0]);
        } else {
            setCurrentAccount(null);
        }
    };

    if (window.ethereum) {
        window.ethereum.on('accountsChanged', handleAccountsChanged);
    }
    
    // Cleanup the listener when the component is unmounted
    return () => {
        if (window.ethereum) {
            window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        }
    };
  }, []);


  return (
    <div className="app-container">
      <nav className="main-nav">
        <button onClick={() => setView('events')} className={view === 'events' ? 'active' : ''}>
          Events
        </button>
        <button onClick={() => setView('predictions')} className={view === 'predictions' ? 'active' : ''}>
          Predictions
        </button>
        
        {/* --- Wallet Button Logic --- */}
        <div className="wallet-container">
          {!currentAccount ? (
            <button onClick={connectWallet} className="wallet-btn">
              Connect Wallet
            </button>
          ) : (
            <p className="wallet-address">
              Connected: {`${currentAccount.substring(0, 6)}...${currentAccount.substring(currentAccount.length - 4)}`}
            </p>
          )}
        </div>
      </nav>

      {view === 'events' ? <EventsInterface /> : <PredictionsInterface />}
    </div>
  );
};

// Events Interface Component (No changes needed here)
const EventsInterface = () => {
  const [events, setEvents] = React.useState([]);
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [newEvent, setNewEvent] = React.useState({
    title: '',
    description: '',
    location: '',
    start_time: '',
    end_time: '',
    capacity: 100
  });

  React.useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      // IMPORTANT: You might need to provide the full URL in development
      // e.g., axios.get('http://localhost:3001/api/events')
      const response = await axios.get('/api/events');
      setEvents(response.data);
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/events', newEvent);
      setShowCreateModal(false);
      fetchEvents();
    } catch (error) {
      console.error('Error creating event:', error);
    }
  };

  return (
    <div className="events-container">
      <div className="header">
        <h2>Manage Events</h2>
        <button onClick={() => setShowCreateModal(true)} className="create-btn">
          + New Event
        </button>
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Create New Event</h3>
            <form onSubmit={handleCreateEvent}>
              <div className="form-group">
                <label>Event Title</label>
                <input
                  type="text"
                  required
                  onChange={(e) => setNewEvent({...newEvent, title: e.target.value})}
                />
              </div>
              
              <div className="form-group">
                <label>Description</label>
                <textarea
                  onChange={(e) => setNewEvent({...newEvent, description: e.target.value})}
                />
              </div>

              <div className="form-group">
                <label>Location</label>
                <input
                  type="text"
                  required
                  onChange={(e) => setNewEvent({...newEvent, location: e.target.value})}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Start Time</label>
                  <input
                    type="datetime-local"
                    required
                    onChange={(e) => setNewEvent({...newEvent, start_time: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label>End Time</label>
                  <input
                    type="datetime-local"
                    required
                    onChange={(e) => setNewEvent({...newEvent, end_time: e.target.value})}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Capacity</label>
                <input
                  type="number"
                  min="1"
                  value={newEvent.capacity}
                  onChange={(e) => setNewEvent({...newEvent, capacity: e.target.value})}
                />
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Create Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="events-list">
        {events.map(event => (
          <div key={event.id} className="event-card">
            <div className="event-header">
              <h3>{event.title}</h3>
              <span className="capacity">🎟️ {event.capacity} spots</span>
            </div>
            <p className="description">{event.description}</p>
            <div className="event-details">
              <div className="detail">
                <span className="icon">📍</span>
                {event.location}
              </div>
              <div className="detail">
                <span className="icon">⏰</span>
                {new Date(event.start_time).toLocaleDateString()} - {new Date(event.end_time).toLocaleDateString()}
              </div>
              <div className="detail">
                <span className="icon">🕒</span>
                {new Date(event.start_time).toLocaleTimeString()} to {new Date(event.end_time).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Existing Predictions Interface (simplified)
const PredictionsInterface = () => {
  return (
    <div className="predictions-container">
      <h2>Predictions Interface</h2>
      {/* Existing predictions content */}
    </div>
  );
};

// This line is not needed in a Vite project's App.jsx,
// but it doesn't hurt to leave it.
// ReactDOM.render(<App />, document.getElementById('root'));

// The important thing is to export the component
export default App;