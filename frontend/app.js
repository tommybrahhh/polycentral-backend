import React from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import './style.css';

// Main App Component
const App = () => {
  const [view, setView] = React.useState('events');

  return (
    <div className="app-container">
      <nav className="main-nav">
        <button onClick={() => setView('events')} className={view === 'events' ? 'active' : ''}>
          Events
        </button>
        <button onClick={() => setView('predictions')} className={view === 'predictions' ? 'active' : ''}>
          Predictions
        </button>
      </nav>

      {view === 'events' ? <EventsInterface /> : <PredictionsInterface />}
    </div>
  );
};

// Events Interface Component
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

ReactDOM.render(<App />, document.getElementById('root'));
