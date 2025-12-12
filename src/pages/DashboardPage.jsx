// src/pages/DashboardPage.jsx
import { useState } from 'react';
import {
    FaUsers,
    FaVenusMars,
    FaLayerGroup,
    FaConciergeBell,
    FaTrophy,
    FaClock,
    FaUserPlus,
    FaCalendarDay,
    FaCalendarWeek,
    FaCalendarAlt
} from 'react-icons/fa';

export default function DashboardPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);

  const cardData = [
    { icon: FaUsers, color: 'blue', label: 'Total Members', value: '11,162', description: 'Total number of registered members in the system' },
    { icon: FaVenusMars, color: 'purple', label: 'Genders', value: '2', description: 'Number of gender categories represented' },
    { icon: FaLayerGroup, color: 'orange', label: 'Categories', value: '9', description: 'Different member categories in the system' },
    { icon: FaConciergeBell, color: 'info', label: 'Services', value: '12', description: 'Available service types for members' },
    { icon: FaTrophy, color: 'success', label: 'Ranks', value: '88', description: 'Number of different ranks held by members' },
    { icon: FaClock, color: 'red', label: 'Avg Experience', value: '10.9Y', description: 'Average years of experience among members' },
    { icon: FaUserPlus, color: 'new', label: 'Registered Today', value: '1', description: 'New members registered today' },
    { icon: FaCalendarWeek, color: 'week', label: 'This Week', value: '14', description: 'New members registered this week' },
    { icon: FaCalendarAlt, color: 'month', label: 'This Month', value: '47', description: 'New members registered this month' },
    { icon: FaCalendarAlt, color: 'quarter', label: 'Last 3 Months', value: '395', description: 'New members registered in last 3 months' }
  ];

  const handleCardClick = (card) => {
    setSelectedCard(card);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedCard(null);
  };

  return (
    <>
      <header className="top-header">
        <h1>Member Dashboard</h1>
        <div className="top-filters">
          <div className="date-group">
            <div><label>From</label><input type="date" defaultValue="2025-04-01" /></div>
            <div><label>To</label><input type="date" defaultValue="2026-03-31" /></div>
          </div>
          <div className="button-group">
            <button className="btn active">All</button>
            <button className="btn">Military</button>
            <button className="btn">Paramilitary</button>
            <button className="btn">Air Force</button>
          </div>
        </div>
      </header>

      <div className="stats-grid">
        {cardData.map((card, index) => (
          <div 
            key={index} 
            className="card" 
            onClick={() => handleCardClick(card)}
            style={{ cursor: 'pointer' }}
          >
            <div className={`card-icon ${card.color}`}>
              <card.icon size={28} />
            </div>
            <div className="card-label">{card.label}</div>
            <div className="card-value">{card.value}</div>
          </div>
        ))}
      </div>

      {isModalOpen && selectedCard && (
        <div className="modal-overlay" style={modalOverlayStyle}>
          <div className="modal-content" style={modalContentStyle}>
            <div className="modal-header" style={modalHeaderStyle}>
              <h2>{selectedCard.label}</h2>
              <button 
                onClick={closeModal}
                style={closeButtonStyle}
              >
                ×
              </button>
            </div>
            <div className="modal-body" style={modalBodyStyle}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                <div className={`card-icon ${selectedCard.color}`} style={{ marginRight: '15px' }}>
                  <selectedCard.icon size={40} />
                </div>
                <div>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{selectedCard.value}</div>
                  <div style={{ color: '#666' }}>{selectedCard.label}</div>
                </div>
              </div>
              <p>{selectedCard.description}</p>
              {/* Add more details as needed */}
              <div style={{ marginTop: '20px' }}>
                <h4>Additional Information</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  <li>Updated: {new Date().toLocaleDateString()}</li>
                  <li>Status: Active</li>
                  {/* Add more relevant details */}
                </ul>
              </div>
            </div>
            <div className="modal-footer" style={modalFooterStyle}>
              <button 
                onClick={closeModal}
                style={modalButtonStyle}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Inline styles for the modal
const modalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000
};

const modalContentStyle = {
  backgroundColor: 'white',
  borderRadius: '8px',
  width: '500px',
  maxWidth: '90%',
  maxHeight: '80vh',
  overflowY: 'auto',
  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
};

const modalHeaderStyle = {
  padding: '15px 20px',
  borderBottom: '1px solid #eee',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const modalBodyStyle = {
  padding: '20px'
};

const modalFooterStyle = {
  padding: '15px 20px',
  borderTop: '1px solid #eee',
  textAlign: 'right'
};

const closeButtonStyle = {
  background: 'none',
  border: 'none',
  fontSize: '1.2rem',
  cursor: 'pointer',
  padding: '5px 10px'
};

const modalButtonStyle = {
  padding: '8px 16px',
  backgroundColor: '#007bff',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '1rem'
};