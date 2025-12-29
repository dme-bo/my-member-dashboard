import React, { useState } from 'react';
import Papa from 'papaparse';
import { getFirestore, collection, doc, setDoc } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { Timestamp } from 'firebase/firestore';

const CSVUploadComponent = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // Password modal state
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const CORRECT_PASSWORD = 'DAA@987';

  const db = getFirestore(getApp());
  const usersMasterCollection = collection(db, 'usersss');

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setMessage('');
      setProgress({ current: 0, total: 0 });
    }
  };

  const formatDateToDDMMMYYYY = (dateInput) => {
    if (!dateInput && dateInput !== 0) return '';

    const dateStr = String(dateInput).trim();
    if (!dateStr || dateStr === 'null' || dateStr === 'undefined') return '';

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const day = String(date.getDate()).padStart(2, '0');
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    return `${day} ${month} ${year}`;
  };

  // Trigger password prompt instead of direct upload
  const handleUploadClick = () => {
    if (!file) {
      setMessage('Please select a CSV file first.');
      return;
    }
    setShowPasswordPrompt(true);
    setPasswordInput('');
    setPasswordError('');
  };

  // Confirm password and proceed with upload
  const confirmUpload = () => {
    if (passwordInput === CORRECT_PASSWORD) {
      setShowPasswordPrompt(false);
      startUpload();
    } else {
      setPasswordError('Incorrect password. Please try again.');
    }
  };

  // Actual upload logic (same as before)
  const startUpload = async () => {
    setUploading(true);
    setMessage('Parsing CSV and uploading one by one...');
    setProgress({ current: 0, total: 0 });

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data;

        if (rows.length === 0) {
          setMessage('No data found in CSV.');
          setUploading(false);
          return;
        }

        setProgress({ current: 0, total: rows.length });

        try {
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            const userData = {
              full_name: row['Full Name'] || '',
              email: row['Email'] || '',
              phone_number: row['Mobile Number'] || '',
              gender: row['Gender'] || '',
              dateofbirth: formatDateToDDMMMYYYY(row['Dob']),
              photo_url: row['Profile Photo'] || '',

              BOCategory: row['Tags'] || '',
              category: row['Category'] || '',
              service: row['Service'] || '',
              rank: row['Rank'] || '',
              level: row['Level'] || '',
              branch: row['Branch'] || '',
              trade: row['Trade'] || '',

              country: row['Country'] || '',
              state: row['State'] || '',
              city: row['City'] || '',
              district: row['District'] || '',
              permanent_address: row['Permanent Address'] || '',

              graduation_course: row['Education'] || '',
              graduation_percentage: row['Education']?.match(/\d+/) ? Number(row['Education'].match(/\d+/)[0]) : 0,
              percentage11th: row['11th Percentage'] || 0,
              percentage12th: row['12th Percentage'] || 0,

              year_of_commission: row['Year Of Commission'] || '',
              course_serial: row['Course Serial'] || '',
              date_of_enrollment: formatDateToDDMMMYYYY(row['Date Of Enrollment']),
              planned_retirement_date: formatDateToDDMMMYYYY(row['Actual Plan Date Of Retirement']),
              actual_retirement_date: formatDateToDDMMMYYYY(row['Actual Retirement']),

              current_ctc: row['Current Ctc'] ? Number(row['Current Ctc']) : 0,
              expected_ctc: row['Expected Ctc'] ? Number(row['Expected Ctc']) : 0,
              notice_period: row['Notice Period'] || '',
              preferred_job_location: row['Preferred Job Location'] || '',
              current_location: row['Current Location'] || '',

              it_skills: row['It Skills'] || '',
              mba: row['Mba'] || '',
              english_proficiency: row['English'] || '',
              skills: row['Skills'] || row['Find Skills'] || '',

              resume_fileurl: row['CV Attachment'] || '',
              aadhaar_number: row['Aadhaar Number'] || '',
              pan_number: row['Pan Number'] || '',
              govt_id_type: row['Govt Id Type'] || '',
              govt_id_number: row['Govt Id Number'] || '',

              bank_name: row['Bank Name'] || '',
              account_holder: row['Account Holder'] || '',
              account_number: row['Account Number'] || '',
              ifsc_code: row['IFSC Code'] || '',

              father_name: row['Father Name'] || '',
              mother_name: row['Mother Name'] || '',

              created_time: Timestamp.now(),
              registration_date: formatDateToDDMMMYYYY(row['Entry Date'] || new Date()),

              member_id: row['Member Id']?.trim() || '',

              country_code: row['Country Code'] || '',
              pincode: row['Pincode'] || '',
              open_jobs: row['Open Jobs'] || '',
              govt_experience: row['Govt Experience'] || '',
              corporate_experience: row['Corporate Experience'] || '',
              total_experience: row['Total Experience'] || '',
              work_experience: row['Work Experience'] || '',
              volunteer_areas: row['VolunteerAreas'] || '',
              security_deposit_agreement: row['Security Deposit Agreement'] || '',
              tcs_terms_agreement: row['Terms Agreement'] || '',
              tcs_agreement: row['Agreement'] || '',
            };

            const userRef = doc(usersMasterCollection);
            await setDoc(userRef, userData, { merge: true });

            setProgress(prev => ({ ...prev, current: i + 1 }));
          }

          setMessage(`Successfully imported all ${rows.length} users into 'usersmaster'!`);
        } catch (error) {
          console.error('Upload error:', error);
          setMessage(`Error at row ${progress.current + 1}: ${error.message}`);
        } finally {
          setUploading(false);
        }
      },
      error: (err) => {
        setMessage(`CSV Parse Error: ${err.message}`);
        setUploading(false);
      },
    });
  };

  return (
    <div style={{ padding: '30px', maxWidth: '700px', margin: 'auto', fontFamily: 'Arial' }}>
      <h2>Import Members to usersmaster Collection</h2>
      <p>
        Upload your CSV file (supports large files like 12,000+ rows). 
        Each record will be uploaded <strong>individually</strong> with a new auto-generated Firestore ID.
      </p>
      <p style={{ color: 'red', fontWeight: 'bold' }}>
        ⚠️ This action is password-protected for security.
      </p>

      <input
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileChange}
        disabled={uploading}
        style={{ display: 'block', marginBottom: '15px' }}
      />

      <button
        onClick={handleUploadClick}
        disabled={!file || uploading}
        style={{
          padding: '10px 20px',
          background: uploading ? '#ccc' : '#0066ff',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: uploading || !file ? 'not-allowed' : 'pointer',
        }}
      >
        {uploading ? 'Uploading & Processing...' : 'Upload CSV (Password Required)'}
      </button>

      {progress.total > 0 && (
        <div style={{ marginTop: '20px' }}>
          <p>Progress: {progress.current} / {progress.total} records processed</p>
          <div style={{
            width: '100%',
            backgroundColor: '#f0f0f0',
            borderRadius: '5px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${(progress.current / progress.total) * 100}%`,
              backgroundColor: '#0066ff',
              height: '20px',
              transition: 'width 0.3s'
            }} />
          </div>
        </div>
      )}

      {message && (
        <p
          style={{
            marginTop: '20px',
            padding: '10px',
            background: message.includes('Error') || message.includes('Parse') ? '#ffeeee' : '#eeffee',
            borderRadius: '5px',
            color: message.includes('Error') || message.includes('Parse') ? 'red' : 'green',
          }}
        >
          {message}
        </p>
      )}

      {/* Password Prompt Modal */}
      {showPasswordPrompt && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'white',
              padding: '30px',
              borderRadius: '10px',
              width: '90%',
              maxWidth: '400px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Enter Password to Proceed</h3>
            <p>This action requires authorization.</p>

            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmUpload()}
              placeholder="Enter password"
              autoFocus
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '16px',
                marginBottom: '10px',
                border: '1px solid #ccc',
                borderRadius: '5px',
              }}
            />

            {passwordError && (
              <p style={{ color: 'red', margin: '10px 0' }}>{passwordError}</p>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowPasswordPrompt(false);
                  setPasswordError('');
                }}
                style={{
                  padding: '8px 16px',
                  background: '#ccc',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmUpload}
                style={{
                  padding: '8px 16px',
                  background: '#0066ff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                }}
              >
                Confirm Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CSVUploadComponent;