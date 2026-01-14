//
//
//-------MASTER DATA--//////
//
////
////
////

// import React, { useState } from 'react';
// import Papa from 'papaparse';
// import { getFirestore, collection, doc, setDoc } from 'firebase/firestore';
// import { getApp } from 'firebase/app';
// import { Timestamp } from 'firebase/firestore';

// const CSVUploadComponent = () => {
//   const [file, setFile] = useState(null);
//   const [uploading, setUploading] = useState(false);
//   const [message, setMessage] = useState('');
//   const [progress, setProgress] = useState({ current: 0, total: 0 });

//   // Password modal state
//   const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
//   const [passwordInput, setPasswordInput] = useState('');
//   const [passwordError, setPasswordError] = useState('');

//   const CORRECT_PASSWORD = 'DAA@987';

//   const db = getFirestore(getApp());
//   const usersMasterCollection = collection(db, 'usersmaster');

//   const handleFileChange = (e) => {
//     if (e.target.files && e.target.files[0]) {
//       setFile(e.target.files[0]);
//       setMessage('');
//       setProgress({ current: 0, total: 0 });
//     }
//   };

//   const formatDateToDDMMMYYYY = (dateInput) => {
//     if (!dateInput && dateInput !== 0) return '';

//     const dateStr = String(dateInput).trim();
//     if (!dateStr || dateStr === 'null' || dateStr === 'undefined') return '';

//     const date = new Date(dateStr);
//     if (isNaN(date.getTime())) return '';

//     const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
//                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

//     const day = String(date.getDate()).padStart(2, '0');
//     const month = months[date.getMonth()];
//     const year = date.getFullYear();

//     return `${day} ${month} ${year}`;
//   };

//   // Trigger password prompt instead of direct upload
//   const handleUploadClick = () => {
//     if (!file) {
//       setMessage('Please select a CSV file first.');
//       return;
//     }
//     setShowPasswordPrompt(true);
//     setPasswordInput('');
//     setPasswordError('');
//   };

//   // Confirm password and proceed with upload
//   const confirmUpload = () => {
//     if (passwordInput === CORRECT_PASSWORD) {
//       setShowPasswordPrompt(false);
//       startUpload();
//     } else {
//       setPasswordError('Incorrect password. Please try again.');
//     }
//   };

//   // Actual upload logic (same as before)
//   const startUpload = async () => {
//     setUploading(true);
//     setMessage('Parsing CSV and uploading one by one...');
//     setProgress({ current: 0, total: 0 });

//     Papa.parse(file, {
//       header: true,
//       skipEmptyLines: true,
//       complete: async (results) => {
//         const rows = results.data;

//         if (rows.length === 0) {
//           setMessage('No data found in CSV.');
//           setUploading(false);
//           return;
//         }

//         setProgress({ current: 0, total: rows.length });

//         try {
//           for (let i = 0; i < rows.length; i++) {
//             const row = rows[i];

//             const userData = {
//               full_name: row['Full Name'] || '',
//               email: row['Email'] || '',
//               phone_number: row['Mobile Number'] || '',
//               gender: row['Gender'] || '',
//               dateofbirth: formatDateToDDMMMYYYY(row['Dob']),
//               photo_url: row['Profile Photo'] || '',

//               BOCategory: row['Tags'] || '',
//               category: row['Category'] || '',
//               service: row['Service'] || '',
//               rank: row['Rank'] || '',
//               level: row['Level'] || '',
//               branch: row['Branch'] || '',
//               trade: row['Trade'] || '',

//               country: row['Country'] || '',
//               state: row['State'] || '',
//               city: row['City'] || '',
//               district: row['District'] || '',
//               permanent_address: row['Permanent Address'] || '',

//               graduation_course: row['Education'] || '',
//               graduation_percentage: row['Education']?.match(/\d+/) ? Number(row['Education'].match(/\d+/)[0]) : 0,
//               percentage11th: row['11th Percentage'] || 0,
//               percentage12th: row['12th Percentage'] || 0,

//               year_of_commission: row['Year Of Commission'] || '',
//               course_serial: row['Course Serial'] || '',
//               date_of_enrollment: formatDateToDDMMMYYYY(row['Date Of Enrollment']),
//               planned_retirement_date: formatDateToDDMMMYYYY(row['Actual Plan Date Of Retirement']),
//               actual_retirement_date: formatDateToDDMMMYYYY(row['Actual Retirement']),

//               current_ctc: row['Current Ctc'] ? Number(row['Current Ctc']) : 0,
//               expected_ctc: row['Expected Ctc'] ? Number(row['Expected Ctc']) : 0,
//               notice_period: row['Notice Period'] || '',
//               preferred_job_location: row['Preferred Job Location'] || '',
//               current_location: row['Current Location'] || '',

//               it_skills: row['It Skills'] || '',
//               mba: row['Mba'] || '',
//               english_proficiency: row['English'] || '',
//               skills: row['Skills'] || row['Find Skills'] || '',

//               resume_fileurl: row['CV Attachment'] || '',
//               aadhaar_number: row['Aadhaar Number'] || '',
//               pan_number: row['Pan Number'] || '',
//               govt_id_type: row['Govt Id Type'] || '',
//               govt_id_number: row['Govt Id Number'] || '',

//               bank_name: row['Bank Name'] || '',
//               account_holder: row['Account Holder'] || '',
//               account_number: row['Account Number'] || '',
//               ifsc_code: row['IFSC Code'] || '',

//               father_name: row['Father Name'] || '',
//               mother_name: row['Mother Name'] || '',

//               created_time: Timestamp.now(),
//               registration_date: formatDateToDDMMMYYYY(row['Entry Date'] || new Date()),

//               member_id: row['Member Id']?.trim() || '',

//               country_code: row['Country Code'] || '',
//               pincode: row['Pincode'] || '',
//               open_jobs: row['Open Jobs'] || '',
//               govt_experience: row['Govt Experience'] || '',
//               corporate_experience: row['Corporate Experience'] || '',
//               total_experience: row['Total Experience'] || '',
//               work_experience: row['Work Experience'] || '',
//               volunteer_areas: row['VolunteerAreas'] || '',
//               security_deposit_agreement: row['Security Deposit Agreement'] || '',
//               tcs_terms_agreement: row['Terms Agreement'] || '',
//               tcs_agreement: row['Agreement'] || '',
//             };

//             const userRef = doc(usersMasterCollection);
//             await setDoc(userRef, userData, { merge: true });

//             setProgress(prev => ({ ...prev, current: i + 1 }));
//           }

//           setMessage(`Successfully imported all ${rows.length} users into 'usersmaster'!`);
//         } catch (error) {
//           console.error('Upload error:', error);
//           setMessage(`Error at row ${progress.current + 1}: ${error.message}`);
//         } finally {
//           setUploading(false);
//         }
//       },
//       error: (err) => {
//         setMessage(`CSV Parse Error: ${err.message}`);
//         setUploading(false);
//       },
//     });
//   };

//   return (
//     <div style={{ padding: '30px', maxWidth: '700px', margin: 'auto', fontFamily: 'Arial' }}>
//       <h2>Import Members to usersmaster Collection</h2>
//       {/* <p>
//         Upload your CSV file (supports large files like 12,000+ rows). 
//         Each record will be uploaded <strong>individually</strong> with a new auto-generated Firestore ID.
//       </p> */}
//       <p style={{ color: 'red', fontWeight: 'bold' }}>
//         ⚠️ This action is password-protected for security.
//       </p>

//       <input
//         type="file"
//         accept=".csv,text/csv"
//         onChange={handleFileChange}
//         disabled={uploading}
//         style={{ display: 'block', marginBottom: '15px' }}
//       />

//       <button
//         onClick={handleUploadClick}
//         disabled={!file || uploading}
//         style={{
//           padding: '10px 20px',
//           background: uploading ? '#ccc' : '#0066ff',
//           color: 'white',
//           border: 'none',
//           borderRadius: '5px',
//           cursor: uploading || !file ? 'not-allowed' : 'pointer',
//         }}
//       >
//         {uploading ? 'Uploading & Processing...' : 'Upload CSV (Password Required)'}
//       </button>

//       {progress.total > 0 && (
//         <div style={{ marginTop: '20px' }}>
//           <p>Progress: {progress.current} / {progress.total} records processed</p>
//           <div style={{
//             width: '100%',
//             backgroundColor: '#f0f0f0',
//             borderRadius: '5px',
//             overflow: 'hidden'
//           }}>
//             <div style={{
//               width: `${(progress.current / progress.total) * 100}%`,
//               backgroundColor: '#0066ff',
//               height: '20px',
//               transition: 'width 0.3s'
//             }} />
//           </div>
//         </div>
//       )}

//       {message && (
//         <p
//           style={{
//             marginTop: '20px',
//             padding: '10px',
//             background: message.includes('Error') || message.includes('Parse') ? '#ffeeee' : '#eeffee',
//             borderRadius: '5px',
//             color: message.includes('Error') || message.includes('Parse') ? 'red' : 'green',
//           }}
//         >
//           {message}
//         </p>
//       )}

//       {/* Password Prompt Modal */}
//       {showPasswordPrompt && (
//         <div
//           style={{
//             position: 'fixed',
//             top: 0,
//             left: 0,
//             width: '100%',
//             height: '100%',
//             backgroundColor: 'rgba(0,0,0,0.6)',
//             display: 'flex',
//             alignItems: 'center',
//             justifyContent: 'center',
//             zIndex: 1000,
//           }}
//         >
//           <div
//             style={{
//               background: 'white',
//               padding: '30px',
//               borderRadius: '10px',
//               width: '90%',
//               maxWidth: '400px',
//               boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
//             }}
//           >
//             <h3 style={{ marginTop: 0 }}>Enter Password to Proceed</h3>
//             <p>This action requires authorization.</p>

//             <input
//               type="password"
//               value={passwordInput}
//               onChange={(e) => setPasswordInput(e.target.value)}
//               onKeyDown={(e) => e.key === 'Enter' && confirmUpload()}
//               placeholder="Enter password"
//               autoFocus
//               style={{
//                 width: '100%',
//                 padding: '10px',
//                 fontSize: '16px',
//                 marginBottom: '10px',
//                 border: '1px solid #ccc',
//                 borderRadius: '5px',
//               }}
//             />

//             {passwordError && (
//               <p style={{ color: 'red', margin: '10px 0' }}>{passwordError}</p>
//             )}

//             <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
//               <button
//                 onClick={() => {
//                   setShowPasswordPrompt(false);
//                   setPasswordError('');
//                 }}
//                 style={{
//                   padding: '8px 16px',
//                   background: '#ccc',
//                   border: 'none',
//                   borderRadius: '5px',
//                   cursor: 'pointer',
//                 }}
//               >
//                 Cancel
//               </button>
//               <button
//                 onClick={confirmUpload}
//                 style={{
//                   padding: '8px 16px',
//                   background: '#0066ff',
//                   color: 'white',
//                   border: 'none',
//                   borderRadius: '5px',
//                   cursor: 'pointer',
//                 }}
//               >
//                 Confirm Upload
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default CSVUploadComponent;


//
///
///
//--- PARTNER AGENT///
///
///
//

// import React, { useState } from 'react';
// import Papa from 'papaparse';
// import { 
//   getFirestore, 
//   collection, 
//   query, 
//   where, 
//   getDocs, 
//   doc, 
//   setDoc,
//   Timestamp 
// } from 'firebase/firestore';
// import { getApp } from 'firebase/app';

// const CSVUploadComponent = () => {
//   const [file, setFile] = useState(null);
//   const [uploading, setUploading] = useState(false);
//   const [message, setMessage] = useState('');
//   const [progress, setProgress] = useState({ current: 0, total: 0 });

//   // Password modal states
//   const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
//   const [passwordInput, setPasswordInput] = useState('');
//   const [passwordError, setPasswordError] = useState('');

//   const CORRECT_PASSWORD = 'DAA@987';

//   const db = getFirestore(getApp());
//   const usersMasterCollection = collection(db, 'partneragentusersmaster');

//   const handleFileChange = (e) => {
//     if (e.target.files && e.target.files[0]) {
//       setFile(e.target.files[0]);
//       setMessage('');
//       setProgress({ current: 0, total: 0 });
//     }
//   };

//   const formatDateToDDMMMYYYY = (dateInput) => {
//     if (!dateInput && dateInput !== 0) return '';
//     const dateStr = String(dateInput).trim();
//     if (!dateStr || dateStr === 'null' || dateStr === 'undefined') return '';
//     const date = new Date(dateStr);
//     if (isNaN(date.getTime())) return '';
//     const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
//     const day = String(date.getDate()).padStart(2, '0');
//     const month = months[date.getMonth()];
//     const year = date.getFullYear();
//     return `${day} ${month} ${year}`;
//   };

//   const handleUploadClick = () => {
//     if (!file) {
//       setMessage('Please select a CSV file first.');
//       return;
//     }
//     setShowPasswordPrompt(true);
//     setPasswordInput('');
//     setPasswordError('');
//   };

//   const confirmUpload = () => {
//     if (passwordInput === CORRECT_PASSWORD) {
//       setShowPasswordPrompt(false);
//       startUpload();
//     } else {
//       setPasswordError('Incorrect password. Please try again.');
//     }
//   };

//   const startUpload = async () => {
//     setUploading(true);
//     setMessage('Processing CSV... Checking existing mobile numbers...');
//     setProgress({ current: 0, total: 0 });

//     Papa.parse(file, {
//       header: true,
//       skipEmptyLines: true,
//       complete: async (results) => {
//         const rows = results.data;
//         if (rows.length === 0) {
//           setMessage('No data found in CSV.');
//           setUploading(false);
//           return;
//         }

//         setProgress({ current: 0, total: rows.length });

//         try {
//           for (let i = 0; i < rows.length; i++) {
//             const row = rows[i];
//             const phone = (row['Mobile No'] || '').trim();

//             // Skip rows without mobile number
//             if (!phone) {
//               console.warn(`Row ${i + 1}: Mobile number missing → skipped`);
//               continue;
//             }

//             // Check if user already exists by phone_number
//             const q = query(usersMasterCollection, where('phone_number', '==', phone));
//             const querySnapshot = await getDocs(q);

//             let docRef;

//             if (!querySnapshot.empty) {
//               // Update existing document (using first match)
//               docRef = querySnapshot.docs[0].ref;
//             } else {
//               // Create new document with auto-generated ID
//               docRef = doc(usersMasterCollection);
//             }

//             // Data to write (will merge with existing if found)
//             const userData = {
//               full_name: row['Full Name'] || '',
//               email: row['Email ID'] || '',
//               phone_number: phone,
//               gender: row['Gender'] || '',
//               dateofbirth: formatDateToDDMMMYYYY(row['Dob']),
//               country: row['COUNTRY'] || '',
//               country_code: row['COUNTRY CODE'] || '',
//               state: row['State'] || '',
//               city: row['City'] || '',
//               district: row['District'] || '',
//               pincode: row['Pincode'] || '',
//               rating: row['Ratings'] || '',

//               // Only set on first creation
//               ...(querySnapshot.empty && {
//                 created_time: Timestamp.now(),
//               }),

//               // Always update these
//               registration_date: formatDateToDDMMMYYYY(row['Entry Date'] || new Date()),
//               last_updated: Timestamp.now(),
//             };

//             // Write / merge
//             await setDoc(docRef, userData, { merge: true });

//             setProgress(prev => ({ ...prev, current: i + 1 }));
//           }

//           setMessage(`Success! Processed ${rows.length} records (created + updated)`);
//         } catch (error) {
//           console.error('Upload error:', error);
//           setMessage(`Error around row ${progress.current + 1}: ${error.message}`);
//         } finally {
//           setUploading(false);
//         }
//       },
//       error: (err) => {
//         setMessage(`CSV parsing failed: ${err.message}`);
//         setUploading(false);
//       },
//     });
//   };

//   return (
//     <div style={{ padding: '30px', maxWidth: '700px', margin: 'auto', fontFamily: 'Arial' }}>
//       <h2>Import / Update Members (by Mobile Number)</h2>
      
//       <p style={{ color: 'red', fontWeight: 'bold' }}>
//         ⚠️ This action is password-protected
//       </p>

//       <input
//         type="file"
//         accept=".csv,text/csv"
//         onChange={handleFileChange}
//         disabled={uploading}
//         style={{ display: 'block', margin: '15px 0' }}
//       />

//       <button
//         onClick={handleUploadClick}
//         disabled={!file || uploading}
//         style={{
//           padding: '10px 24px',
//           background: uploading ? '#ccc' : '#0066ff',
//           color: 'white',
//           border: 'none',
//           borderRadius: '6px',
//           cursor: uploading || !file ? 'not-allowed' : 'pointer',
//           fontSize: '16px',
//         }}
//       >
//         {uploading ? 'Processing...' : 'Upload & Update CSV'}
//       </button>

//       {progress.total > 0 && (
//         <div style={{ margin: '25px 0' }}>
//           <p>Progress: {progress.current} / {progress.total}</p>
//           <div style={{
//             width: '100%',
//             height: '24px',
//             backgroundColor: '#f0f0f0',
//             borderRadius: '6px',
//             overflow: 'hidden'
//           }}>
//             <div style={{
//               width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
//               height: '100%',
//               backgroundColor: '#0066ff',
//               transition: 'width 0.4s ease'
//             }} />
//           </div>
//         </div>
//       )}

//       {message && (
//         <div style={{
//           marginTop: '25px',
//           padding: '14px',
//           borderRadius: '6px',
//           backgroundColor: message.includes('Error') ? '#ffebee' : '#e8f5e9',
//           color: message.includes('Error') ? '#c62828' : '#2e7d32',
//           border: `1px solid ${message.includes('Error') ? '#ef9a9a' : '#a5d6a7'}`
//         }}>
//           {message}
//         </div>
//       )}

//       {/* Password Modal */}
//       {showPasswordPrompt && (
//         <div style={{
//           position: 'fixed',
//           inset: 0,
//           backgroundColor: 'rgba(0,0,0,0.6)',
//           display: 'flex',
//           alignItems: 'center',
//           justifyContent: 'center',
//           zIndex: 1000,
//         }}>
//           <div style={{
//             background: 'white',
//             padding: '32px',
//             borderRadius: '12px',
//             width: '90%',
//             maxWidth: '420px',
//             boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
//           }}>
//             <h3 style={{ margin: '0 0 16px 0' }}>Security Check</h3>
//             <p style={{ margin: '0 0 20px 0', color: '#555' }}>
//               Enter password to continue
//             </p>

//             <input
//               type="password"
//               value={passwordInput}
//               onChange={(e) => setPasswordInput(e.target.value)}
//               onKeyDown={(e) => e.key === 'Enter' && confirmUpload()}
//               placeholder="Password"
//               autoFocus
//               style={{
//                 width: '100%',
//                 padding: '12px',
//                 fontSize: '16px',
//                 marginBottom: '16px',
//                 border: '1px solid #ccc',
//                 borderRadius: '6px',
//                 boxSizing: 'border-box'
//               }}
//             />

//             {passwordError && (
//               <p style={{ color: '#d32f2f', margin: '0 0 16px 0' }}>
//                 {passwordError}
//               </p>
//             )}

//             <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
//               <button
//                 onClick={() => {
//                   setShowPasswordPrompt(false);
//                   setPasswordError('');
//                 }}
//                 style={{
//                   padding: '10px 20px',
//                   background: '#e0e0e0',
//                   border: 'none',
//                   borderRadius: '6px',
//                   cursor: 'pointer'
//                 }}
//               >
//                 Cancel
//               </button>
//               <button
//                 onClick={confirmUpload}
//                 style={{
//                   padding: '10px 20px',
//                   background: '#0066ff',
//                   color: 'white',
//                   border: 'none',
//                   borderRadius: '6px',
//                   cursor: 'pointer'
//                 }}
//               >
//                 Confirm
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default CSVUploadComponent;

//
//
///----PROJECTS---////////
///
///
///

// import React, { useState } from 'react';
// import Papa from 'papaparse';
// import { getFirestore, collection, doc, setDoc } from 'firebase/firestore';
// import { getApp } from 'firebase/app';
// import { Timestamp } from 'firebase/firestore';

// const CSVUploadComponent = () => {
//   const [file, setFile] = useState(null);
//   const [uploading, setUploading] = useState(false);
//   const [message, setMessage] = useState('');
//   const [progress, setProgress] = useState({ current: 0, total: 0 });

//   // Password modal state
//   const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
//   const [passwordInput, setPasswordInput] = useState('');
//   const [passwordError, setPasswordError] = useState('');

//   const CORRECT_PASSWORD = 'DAA@987';

//   const db = getFirestore(getApp());
//   const usersMasterCollection = collection(db, 'projectusersmaster');

//   const handleFileChange = (e) => {
//     if (e.target.files && e.target.files[0]) {
//       setFile(e.target.files[0]);
//       setMessage('');
//       setProgress({ current: 0, total: 0 });
//     }
//   };

//   const formatDateToDDMMMYYYY = (dateInput) => {
//     if (!dateInput && dateInput !== 0) return '';

//     const dateStr = String(dateInput).trim();
//     if (!dateStr || dateStr === 'null' || dateStr === 'undefined') return '';

//     const date = new Date(dateStr);
//     if (isNaN(date.getTime())) return '';

//     const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
//                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

//     const day = String(date.getDate()).padStart(2, '0');
//     const month = months[date.getMonth()];
//     const year = date.getFullYear();

//     return `${day} ${month} ${year}`;
//   };

//   const handleUploadClick = () => {
//     if (!file) {
//       setMessage('Please select a CSV file first.');
//       return;
//     }
//     setShowPasswordPrompt(true);
//     setPasswordInput('');
//     setPasswordError('');
//   };

//   const confirmUpload = () => {
//     if (passwordInput === CORRECT_PASSWORD) {
//       setShowPasswordPrompt(false);
//       startUpload();
//     } else {
//       setPasswordError('Incorrect password. Please try again.');
//     }
//   };

//   const startUpload = async () => {
//     setUploading(true);
//     setMessage('Parsing CSV and uploading one by one...');
//     setProgress({ current: 0, total: 0 });

//     Papa.parse(file, {
//       header: true,
//       skipEmptyLines: true,
//       complete: async (results) => {
//         const rows = results.data;

//         if (rows.length === 0) {
//           setMessage('No data found in CSV.');
//           setUploading(false);
//           return;
//         }

//         setProgress({ current: 0, total: rows.length });

//         try {
//           for (let i = 0; i < rows.length; i++) {
//             const row = rows[i];

//             const userData = {
//               // New header mapping
//               full_name: row['Name'] || '',
//               phone_number: row['Phone'] || '',
//               city: row['City'] || '',
//               pan_number: row['PAN'] || '',
//               aadhaar_number: row['Aadhar'] || '',
//               projects: row['Projects'] || '',

//               created_time: Timestamp.now(),
//             };

//             const userRef = doc(usersMasterCollection);
//             await setDoc(userRef, userData, { merge: true });

//             setProgress(prev => ({ ...prev, current: i + 1 }));
//           }

//           setMessage(`Successfully imported all ${rows.length} users into 'usersss'!`);
//         } catch (error) {
//           console.error('Upload error:', error);
//           setMessage(`Error at row ${progress.current + 1}: ${error.message}`);
//         } finally {
//           setUploading(false);
//         }
//       },
//       error: (err) => {
//         setMessage(`CSV Parse Error: ${err.message}`);
//         setUploading(false);
//       },
//     });
//   };

//   return (
//     <div style={{ padding: '30px', maxWidth: '700px', margin: 'auto', fontFamily: 'Arial' }}>
//       <h2>Import Members to usersss Collection</h2>
//       <p>
//         Upload your CSV file with columns: <strong>Name, Phone, City, PAN, Aadhar, Projects</strong>.
//         Each record will be uploaded individually with a new auto-generated Firestore ID.
//       </p>
//       <p style={{ color: 'red', fontWeight: 'bold' }}>
//         ⚠️ This action is password-protected for security.
//       </p>

//       <input
//         type="file"
//         accept=".csv,text/csv"
//         onChange={handleFileChange}
//         disabled={uploading}
//         style={{ display: 'block', marginBottom: '15px' }}
//       />

//       <button
//         onClick={handleUploadClick}
//         disabled={!file || uploading}
//         style={{
//           padding: '10px 20px',
//           background: uploading ? '#ccc' : '#0066ff',
//           color: 'white',
//           border: 'none',
//           borderRadius: '5px',
//           cursor: uploading || !file ? 'not-allowed' : 'pointer',
//         }}
//       >
//         {uploading ? 'Uploading & Processing...' : 'Upload CSV (Password Required)'}
//       </button>

//       {progress.total > 0 && (
//         <div style={{ marginTop: '20px' }}>
//           <p>Progress: {progress.current} / {progress.total} records processed</p>
//           <div style={{
//             width: '100%',
//             backgroundColor: '#f0f0f0',
//             borderRadius: '5px',
//             overflow: 'hidden'
//           }}>
//             <div style={{
//               width: `${(progress.current / progress.total) * 100}%`,
//               backgroundColor: '#0066ff',
//               height: '20px',
//               transition: 'width 0.3s'
//             }} />
//           </div>
//         </div>
//       )}

//       {message && (
//         <p
//           style={{
//             marginTop: '20px',
//             padding: '10px',
//             background: message.includes('Error') || message.includes('Parse') ? '#ffeeee' : '#eeffee',
//             borderRadius: '5px',
//             color: message.includes('Error') || message.includes('Parse') ? 'red' : 'green',
//           }}
//         >
//           {message}
//         </p>
//       )}

//       {/* Password Prompt Modal */}
//       {showPasswordPrompt && (
//         <div
//           style={{
//             position: 'fixed',
//             top: 0,
//             left: 0,
//             width: '100%',
//             height: '100%',
//             backgroundColor: 'rgba(0,0,0,0.6)',
//             display: 'flex',
//             alignItems: 'center',
//             justifyContent: 'center',
//             zIndex: 1000,
//           }}
//         >
//           <div
//             style={{
//               background: 'white',
//               padding: '30px',
//               borderRadius: '10px',
//               width: '90%',
//               maxWidth: '400px',
//               boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
//             }}
//           >
//             <h3 style={{ marginTop: 0 }}>Enter Password to Proceed</h3>
//             <p>This action requires authorization.</p>

//             <input
//               type="password"
//               value={passwordInput}
//               onChange={(e) => setPasswordInput(e.target.value)}
//               onKeyDown={(e) => e.key === 'Enter' && confirmUpload()}
//               placeholder="Enter password"
//               autoFocus
//               style={{
//                 width: '100%',
//                 padding: '10px',
//                 fontSize: '16px',
//                 marginBottom: '10px',
//                 border: '1px solid #ccc',
//                 borderRadius: '5px',
//               }}
//             />

//             {passwordError && (
//               <p style={{ color: 'red', margin: '10px 0' }}>{passwordError}</p>
//             )}

//             <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
//               <button
//                 onClick={() => {
//                   setShowPasswordPrompt(false);
//                   setPasswordError('');
//                 }}
//                 style={{
//                   padding: '8px 16px',
//                   background: '#ccc',
//                   border: 'none',
//                   borderRadius: '5px',
//                   cursor: 'pointer',
//                 }}
//               >
//                 Cancel
//               </button>
//               <button
//                 onClick={confirmUpload}
//                 style={{
//                   padding: '8px 16px',
//                   background: '#0066ff',
//                   color: 'white',
//                   border: 'none',
//                   borderRadius: '5px',
//                   cursor: 'pointer',
//                 }}
//               >
//                 Confirm Upload
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default CSVUploadComponent;


//
//
//-------TCS MEMBER--//////
//
////
////
////


// import React, { useState } from 'react';
// import Papa from 'papaparse';
// import { getFirestore, collection, doc, setDoc } from 'firebase/firestore';
// import { getApp } from 'firebase/app';
// import { Timestamp } from 'firebase/firestore';

// const CSVUploadComponent = () => {
//   const [file, setFile] = useState(null);
//   const [uploading, setUploading] = useState(false);
//   const [message, setMessage] = useState('');
//   const [progress, setProgress] = useState({ current: 0, total: 0 });

//   // Password modal state
//   const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
//   const [passwordInput, setPasswordInput] = useState('');
//   const [passwordError, setPasswordError] = useState('');

//   const CORRECT_PASSWORD = 'DAA@987';

//   const db = getFirestore(getApp());
//   const usersMasterCollection = collection(db, 'tcsusersmaster');

//   const handleFileChange = (e) => {
//     if (e.target.files && e.target.files[0]) {
//       setFile(e.target.files[0]);
//       setMessage('');
//       setProgress({ current: 0, total: 0 });
//     }
//   };

//   const handleUploadClick = () => {
//     if (!file) {
//       setMessage('Please select a CSV file first.');
//       return;
//     }
//     setShowPasswordPrompt(true);
//     setPasswordInput('');
//     setPasswordError('');
//   };

//   const confirmUpload = () => {
//     if (passwordInput === CORRECT_PASSWORD) {
//       setShowPasswordPrompt(false);
//       startUpload();
//     } else {
//       setPasswordError('Incorrect password. Please try again.');
//     }
//   };

//   const startUpload = async () => {
//     setUploading(true);
//     setMessage('Parsing CSV and uploading one by one...');
//     setProgress({ current: 0, total: 0 });

//     Papa.parse(file, {
//       header: true,
//       skipEmptyLines: true,
//       complete: async (results) => {
//         const rows = results.data;

//         if (rows.length === 0) {
//           setMessage('No data found in CSV.');
//           setUploading(false);
//           return;
//         }

//         setProgress({ current: 0, total: rows.length });

//         try {
//           for (let i = 0; i < rows.length; i++) {
//             const row = rows[i];

//             const userData = {
//               city: row['city']?.trim() || '',
//               full_name: row['Manpower Name']?.trim() || '',
//               resources_id: row['Resources Id']?.trim() || '',
//               contact_number: row['Contact Number']?.trim() || '',
//               email_id: row['Email Id']?.trim() || '',
//               bank_account: row['Bank Account']?.trim() || '',
//               ifsc_code: row['IFSC']?.trim() || '',
//               pan_number: row['PAN']?.trim() || '',
//               aadhar_number: row['Aadhar']?.trim() || '',
//               coordinator_name: row['Coordinator']?.trim() || '',
//               role: row['Role']?.trim() || '',
//               status: row['Status']?.trim() || '',
//               background_status: row['Background Status']?.trim() || '',
//               member_type: row['Type']?.trim() || '',

//               created_time: Timestamp.now(),
//             };

//             const userRef = doc(usersMasterCollection);
//             await setDoc(userRef, userData, { merge: true });

//             setProgress(prev => ({ ...prev, current: i + 1 }));
//           }

//           setMessage(`Successfully imported all ${rows.length} users into 'projectusersmaster'!`);
//         } catch (error) {
//           console.error('Upload error:', error);
//           setMessage(`Error at row ${progress.current + 1}: ${error.message}`);
//         } finally {
//           setUploading(false);
//         }
//       },
//       error: (err) => {
//         setMessage(`CSV Parse Error: ${err.message}`);
//         setUploading(false);
//       },
//     });
//   };

//   return (
//     <div style={{ padding: '30px', maxWidth: '700px', margin: 'auto', fontFamily: 'Arial' }}>
//       <h2>Import Members to projectusersmaster Collection</h2>
//       <p>
//         Upload your CSV file with the following columns (exact header names required):<br />
//         <strong>
//           city, Manpower Name, Resources Id, Contact Number, Email Id, Bank Account, IFSC, PAN, Aadhar, Coordinator, Role, Status, Background Status
//         </strong>
//       </p>
//       <p style={{ color: 'red', fontWeight: 'bold' }}>
//         ⚠️ This action is password-protected for security.
//       </p>

//       <input
//         type="file"
//         accept=".csv,text/csv"
//         onChange={handleFileChange}
//         disabled={uploading}
//         style={{ display: 'block', marginBottom: '15px' }}
//       />

//       <button
//         onClick={handleUploadClick}
//         disabled={!file || uploading}
//         style={{
//           padding: '10px 20px',
//           background: uploading ? '#ccc' : '#0066ff',
//           color: 'white',
//           border: 'none',
//           borderRadius: '5px',
//           cursor: uploading || !file ? 'not-allowed' : 'pointer',
//         }}
//       >
//         {uploading ? 'Uploading & Processing...' : 'Upload CSV (Password Required)'}
//       </button>

//       {progress.total > 0 && (
//         <div style={{ marginTop: '20px' }}>
//           <p>Progress: {progress.current} / {progress.total} records processed</p>
//           <div style={{
//             width: '100%',
//             backgroundColor: '#f0f0f0',
//             borderRadius: '5px',
//             overflow: 'hidden'
//           }}>
//             <div style={{
//               width: `${(progress.current / progress.total) * 100}%`,
//               backgroundColor: '#0066ff',
//               height: '20px',
//               transition: 'width 0.3s'
//             }} />
//           </div>
//         </div>
//       )}

//       {message && (
//         <p
//           style={{
//             marginTop: '20px',
//             padding: '10px',
//             background: message.includes('Error') || message.includes('Parse') ? '#ffeeee' : '#eeffee',
//             borderRadius: '5px',
//             color: message.includes('Error') || message.includes('Parse') ? 'red' : 'green',
//           }}
//         >
//           {message}
//         </p>
//       )}

//       {/* Password Prompt Modal */}
//       {showPasswordPrompt && (
//         <div
//           style={{
//             position: 'fixed',
//             top: 0,
//             left: 0,
//             width: '100%',
//             height: '100%',
//             backgroundColor: 'rgba(0,0,0,0.6)',
//             display: 'flex',
//             alignItems: 'center',
//             justifyContent: 'center',
//             zIndex: 1000,
//           }}
//         >
//           <div
//             style={{
//               background: 'white',
//               padding: '30px',
//               borderRadius: '10px',
//               width: '90%',
//               maxWidth: '400px',
//               boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
//             }}
//           >
//             <h3 style={{ marginTop: 0 }}>Enter Password to Proceed</h3>
//             <p>This action requires authorization.</p>

//             <input
//               type="password"
//               value={passwordInput}
//               onChange={(e) => setPasswordInput(e.target.value)}
//               onKeyDown={(e) => e.key === 'Enter' && confirmUpload()}
//               placeholder="Enter password"
//               autoFocus
//               style={{
//                 width: '100%',
//                 padding: '10px',
//                 fontSize: '16px',
//                 marginBottom: '10px',
//                 border: '1px solid #ccc',
//                 borderRadius: '5px',
//               }}
//             />

//             {passwordError && (
//               <p style={{ color: 'red', margin: '10px 0' }}>{passwordError}</p>
//             )}

//             <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
//               <button
//                 onClick={() => {
//                   setShowPasswordPrompt(false);
//                   setPasswordError('');
//                 }}
//                 style={{
//                   padding: '8px 16px',
//                   background: '#ccc',
//                   border: 'none',
//                   borderRadius: '5px',
//                   cursor: 'pointer',
//                 }}
//               >
//                 Cancel
//               </button>
//               <button
//                 onClick={confirmUpload}
//                 style={{
//                   padding: '8px 16px',
//                   background: '#0066ff',
//                   color: 'white',
//                   border: 'none',
//                   borderRadius: '5px',
//                   cursor: 'pointer',
//                 }}
//               >
//                 Confirm Upload
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default CSVUploadComponent;



//
//
//-------TCS COORDINATOR--//////
//
////
////
////

// import React, { useState } from 'react';
// import Papa from 'papaparse';
// import { getFirestore, collection, doc, setDoc } from 'firebase/firestore';
// import { getApp } from 'firebase/app';
// import { Timestamp } from 'firebase/firestore';

// const CSVUploadComponent = () => {
//   const [file, setFile] = useState(null);
//   const [uploading, setUploading] = useState(false);
//   const [message, setMessage] = useState('');
//   const [progress, setProgress] = useState({ current: 0, total: 0 });

//   // Password modal state
//   const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
//   const [passwordInput, setPasswordInput] = useState('');
//   const [passwordError, setPasswordError] = useState('');

//   const CORRECT_PASSWORD = 'DAA@987';

//   const db = getFirestore(getApp());
//   const usersMasterCollection = collection(db, 'tcscoordinatorusersmaster');

//   const handleFileChange = (e) => {
//     if (e.target.files && e.target.files[0]) {
//       setFile(e.target.files[0]);
//       setMessage('');
//       setProgress({ current: 0, total: 0 });
//     }
//   };

//   const handleUploadClick = () => {
//     if (!file) {
//       setMessage('Please select a CSV file first.');
//       return;
//     }
//     setShowPasswordPrompt(true);
//     setPasswordInput('');
//     setPasswordError('');
//   };

//   const confirmUpload = () => {
//     if (passwordInput === CORRECT_PASSWORD) {
//       setShowPasswordPrompt(false);
//       startUpload();
//     } else {
//       setPasswordError('Incorrect password. Please try again.');
//     }
//   };

//   const startUpload = async () => {
//     setUploading(true);
//     setMessage('Parsing CSV and grouping coordinators...');
//     setProgress({ current: 0, total: 0 });

//     Papa.parse(file, {
//       header: true,
//       skipEmptyLines: true,
//       complete: async (results) => {
//         const rows = results.data;

//         if (rows.length === 0) {
//           setMessage('No data found in CSV.');
//           setUploading(false);
//           return;
//         }

//         // Map to group coordinators by unique identifier
//         const coordinatorsMap = new Map();

//         rows.forEach((row, index) => {
//           const contact_number = row['Number']?.trim() || '';
//           const resources_id = row['Resource Id']?.trim() || '';
//           const email_id = row['Email Id']?.trim() || '';
//           const full_name = row['Coordinator  Name']?.trim() || '';

//           // Priority for unique key: contact_number > resources_id > email_id > fallback index
//           const key = contact_number || resources_id || email_id || `fallback_${index}`;

//           if (!coordinatorsMap.has(key)) {
//             coordinatorsMap.set(key, {
//               full_name,
//               contact_number,
//               resources_id,
//               email_id,
//               bank_account: row['Bank Account No.']?.trim() || '',
//               ifsc_code: row['IFSC']?.trim() || '',
//               pan_number: row['PAN']?.trim() || '',
//               aadhar_number: row['Aadhar']?.trim() || '',
//               background_status: row['Background']?.trim() || '',
//               coordinator_type: row['Type']?.trim() || '', // optional: can move inside locations if varies per city
//               locations: [],
//               created_time: Timestamp.now(),
//             });
//           }

//           // Add location-specific entry
//           const city = row['City']?.trim() || '';
//           const manpower_available = row['Manpower Available']?.trim() || '';
//           const coordinator_type = row['Type']?.trim() || '';

//           if (city) {
//             const locationEntry = {
//               city,
//               manpower_available,
//               coordinator_type,
//               // Add more per-city fields here if needed
//             };

//             const coordinatorData = coordinatorsMap.get(key);

//             // Avoid duplicate city entries (optional: remove if duplicates are valid)
//             const exists = coordinatorData.locations.some(
//               loc => loc.city === city && loc.manpower_available === manpower_available && loc.coordinator_type === coordinator_type
//             );

//             if (!exists) {
//               coordinatorData.locations.push(locationEntry);
//             }
//           }
//         });

//         const totalCoordinators = coordinatorsMap.size;
//         setProgress({ current: 0, total: totalCoordinators });

//         let processed = 0;

//         try {
//           for (const [key, data] of coordinatorsMap) {
//             // Use the most reliable ID as Firestore document ID
//             const docId = data.contact_number || data.resources_id || data.email_id || key;
//             const userRef = doc(usersMasterCollection, docId);

//             await setDoc(userRef, data, { merge: true });

//             processed++;
//             setProgress({ current: processed, total: totalCoordinators });
//           }

//           setMessage(
//             `Successfully imported ${totalCoordinators} unique coordinators (with multi-city data) into 'tcsusersmaster'!`
//           );
//         } catch (error) {
//           console.error('Upload error:', error);
//           setMessage(`Error uploading coordinator: ${error.message}`);
//         } finally {
//           setUploading(false);
//         }
//       },
//       error: (err) => {
//         setMessage(`CSV Parse Error: ${err.message}`);
//         setUploading(false);
//       },
//     });
//   };

//   return (
//     <div style={{ padding: '30px', maxWidth: '700px', margin: 'auto', fontFamily: 'Arial' }}>
//       <h2>Import Coordinators to tcsusersmaster Collection</h2>
//       <p>
//         Upload your CSV file. Multiple rows with the same coordinator (same contact number or Resource ID) will be merged into one document with all cities listed.
//       </p>
//       <p>
//         <strong>Required/Expected columns:</strong><br />
//         Coordinator Name, Number, Resource Id, City, Manpower Available, Email Id, Bank Account No., IFSC, PAN, Aadhar, Background, Type
//       </p>

//       <p style={{ color: 'red', fontWeight: 'bold' }}>
//         ⚠️ This action is password-protected for security.
//       </p>

//       <input
//         type="file"
//         accept=".csv,text/csv"
//         onChange={handleFileChange}
//         disabled={uploading}
//         style={{ display: 'block', marginBottom: '15px' }}
//       />

//       <button
//         onClick={handleUploadClick}
//         disabled={!file || uploading}
//         style={{
//           padding: '10px 20px',
//           background: uploading ? '#ccc' : '#0066ff',
//           color: 'white',
//           border: 'none',
//           borderRadius: '5px',
//           cursor: uploading || !file ? 'not-allowed' : 'pointer',
//         }}
//       >
//         {uploading ? 'Processing & Uploading...' : 'Upload CSV (Password Required)'}
//       </button>

//       {progress.total > 0 && (
//         <div style={{ marginTop: '20px' }}>
//           <p>
//             Progress: {progress.current} / {progress.total} unique coordinators processed
//           </p>
//           <div
//             style={{
//               width: '100%',
//               backgroundColor: '#f0f0f0',
//               borderRadius: '5px',
//               overflow: 'hidden',
//             }}
//           >
//             <div
//               style={{
//                 width: `${(progress.current / progress.total) * 100}%`,
//                 backgroundColor: '#0066ff',
//                 height: '20px',
//                 transition: 'width 0.3s',
//               }}
//             />
//           </div>
//         </div>
//       )}

//       {message && (
//         <p
//           style={{
//             marginTop: '20px',
//             padding: '10px',
//             background: message.includes('Error') || message.includes('Parse')
//               ? '#ffeeee'
//               : '#eeffee',
//             borderRadius: '5px',
//             color: message.includes('Error') || message.includes('Parse') ? 'red' : 'green',
//           }}
//         >
//           {message}
//         </p>
//       )}

//       {/* Password Prompt Modal */}
//       {showPasswordPrompt && (
//         <div
//           style={{
//             position: 'fixed',
//             top: 0,
//             left: 0,
//             width: '100%',
//             height: '100%',
//             backgroundColor: 'rgba(0,0,0,0.6)',
//             display: 'flex',
//             alignItems: 'center',
//             justifyContent: 'center',
//             zIndex: 1000,
//           }}
//         >
//           <div
//             style={{
//               background: 'white',
//               padding: '30px',
//               borderRadius: '10px',
//               width: '90%',
//               maxWidth: '400px',
//               boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
//             }}
//           >
//             <h3 style={{ marginTop: 0 }}>Enter Password to Proceed</h3>
//             <p>This action requires authorization.</p>

//             <input
//               type="password"
//               value={passwordInput}
//               onChange={(e) => setPasswordInput(e.target.value)}
//               onKeyDown={(e) => e.key === 'Enter' && confirmUpload()}
//               placeholder="Enter password"
//               autoFocus
//               style={{
//                 width: '100%',
//                 padding: '10px',
//                 fontSize: '16px',
//                 marginBottom: '10px',
//                 border: '1px solid #ccc',
//                 borderRadius: '5px',
//               }}
//             />

//             {passwordError && <p style={{ color: 'red', margin: '10px 0' }}>{passwordError}</p>}

//             <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
//               <button
//                 onClick={() => {
//                   setShowPasswordPrompt(false);
//                   setPasswordError('');
//                 }}
//                 style={{
//                   padding: '8px 16px',
//                   background: '#ccc',
//                   border: 'none',
//                   borderRadius: '5px',
//                   cursor: 'pointer',
//                 }}
//               >
//                 Cancel
//               </button>
//               <button
//                 onClick={confirmUpload}
//                 style={{
//                   padding: '8px 16px',
//                   background: '#0066ff',
//                   color: 'white',
//                   border: 'none',
//                   borderRadius: '5px',
//                   cursor: 'pointer',
//                 }}
//               >
//                 Confirm Upload
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default CSVUploadComponent;

//
//
//-------RECRUITMENT--//////
//
////
////
////


// // Inside the Papa.parse complete callback, replace the userData object with this:

// import React, { useState } from 'react';
// import Papa from 'papaparse';
// import { getFirestore, collection, doc, setDoc } from 'firebase/firestore';
// import { getApp } from 'firebase/app';
// import { Timestamp } from 'firebase/firestore';

// const CSVUploadComponent = () => {
//   const [file, setFile] = useState(null);
//   const [uploading, setUploading] = useState(false);
//   const [message, setMessage] = useState('');
//   const [progress, setProgress] = useState({ current: 0, total: 0 });

//   // Password modal state
//   const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
//   const [passwordInput, setPasswordInput] = useState('');
//   const [passwordError, setPasswordError] = useState('');

//   const CORRECT_PASSWORD = 'DAA@987';

//   const db = getFirestore(getApp());
//   const usersMasterCollection = collection(db, 'jobsusersmaster');

//   const handleFileChange = (e) => {
//     if (e.target.files && e.target.files[0]) {
//       setFile(e.target.files[0]);
//       setMessage('');
//       setProgress({ current: 0, total: 0 });
//     }
//   };

//   const formatDateToDDMMMYYYY = (dateInput) => {
//     if (!dateInput && dateInput !== 0) return '';

//     const dateStr = String(dateInput).trim();
//     if (!dateStr || dateStr === 'null' || dateStr === 'undefined') return '';

//     const date = new Date(dateStr);
//     if (isNaN(date.getTime())) return '';

//     const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
//                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

//     const day = String(date.getDate()).padStart(2, '0');
//     const month = months[date.getMonth()];
//     const year = date.getFullYear();

//     return `${day} ${month} ${year}`;
//   };

//   // Trigger password prompt instead of direct upload
//   const handleUploadClick = () => {
//     if (!file) {
//       setMessage('Please select a CSV file first.');
//       return;
//     }
//     setShowPasswordPrompt(true);
//     setPasswordInput('');
//     setPasswordError('');
//   };

//   // Confirm password and proceed with upload
//   const confirmUpload = () => {
//     if (passwordInput === CORRECT_PASSWORD) {
//       setShowPasswordPrompt(false);
//       startUpload();
//     } else {
//       setPasswordError('Incorrect password. Please try again.');
//     }
//   };

//   // Actual upload logic (same as before)
//   const startUpload = async () => {
//     setUploading(true);
//     setMessage('Parsing CSV and uploading one by one...');
//     setProgress({ current: 0, total: 0 });

//     Papa.parse(file, {
//       header: true,
//       skipEmptyLines: true,
//       complete: async (results) => {
//         const rows = results.data;

//         if (rows.length === 0) {
//           setMessage('No data found in CSV.');
//           setUploading(false);
//           return;
//         }

//         setProgress({ current: 0, total: rows.length });

//         try {
//           for (let i = 0; i < rows.length; i++) {
//             const row = rows[i];

//            const userData = {
//   full_name: row['Name']?.trim() || '',
//   contact_number: row['Contact']?.trim() || '',
//   email_id: row['Email']?.trim() || '',
//   education: row['Education']?.trim() || '',
//   service_experience_years: row['Service Experience (Years)']?.trim() || '',
//   corporate_experience_years: row['Corporate Experience (Years)']?.trim() || '',
//   total_experience_years: row['Total Experience (Years)']?.trim() || '',
//   category: row['Category']?.trim() || '',
//   service: row['Service']?.trim() || '',
//   rank: row['Rank']?.trim() || '',
//   fixed: row['Fixed']?.trim() || '',
//   variable: row['Variable']?.trim() || '',
//   total_ctc_lacs: row['Total CTC (lacs)']?.trim() || '',
//   ectc: row['ECTC']?.trim() || '',
//   notice_period_days: row['Notice Period (Days)']?.trim() || '',
//   client: row['Client']?.trim() || '',
//   current_location: row['Current Location']?.trim() || '',
//   job_location: row['Job Location']?.trim() || '',
//   reason_of_change: row['Reason Of Change, If Any']?.trim() || '',
//   profile: row['Profile']?.trim() || '',
//   cv_link: row['CV']?.trim() || '', // assuming this is a URL or filename
//   source: row['Source']?.trim() || '',
//   details: row['Details']?.trim() || '',
//   erp_link: row['ERP Link']?.trim() || '',
//   availability_date: row['Availability Date']?.trim() || '',
//   availability_time: row['Availability Time']?.trim() || '',
//   internal_interview: row['Internal Interview']?.trim() || '',
//   internal_interview_status: row['Internal Interview Status']?.trim() || '',
//   external_interview: row['External Interview']?.trim() || '',
//   external_interview_status: row['External Interview Status']?.trim() || '', // note the quotes in original header
//   remarks: row['Remarks (Current Conversation)']?.trim() || '',
//   final_status: row['Final Status']?.trim() || '',

//   // You might want to keep some defaults or metadata
//   city: row['Current Location']?.trim() || '', // using Current Location as city if needed
//   // role: row['Category']?.trim() || '',         // adjust based on your needs
//   status: row['Final Status']?.trim() || 'Active',

//   created_time: Timestamp.now(),
// };
//             const userRef = doc(usersMasterCollection);
//             await setDoc(userRef, userData, { merge: true });

//             setProgress(prev => ({ ...prev, current: i + 1 }));
//           }

//           setMessage(`Successfully imported all ${rows.length} users into 'usersmaster'!`);
//         } catch (error) {
//           console.error('Upload error:', error);
//           setMessage(`Error at row ${progress.current + 1}: ${error.message}`);
//         } finally {
//           setUploading(false);
//         }
//       },
//       error: (err) => {
//         setMessage(`CSV Parse Error: ${err.message}`);
//         setUploading(false);
//       },
//     });
//   };

//   return (
//     <div style={{ padding: '30px', maxWidth: '700px', margin: 'auto', fontFamily: 'Arial' }}>
//       <h2>Import Members to usersmaster Collection</h2>
//       {/* <p>
//         Upload your CSV file (supports large files like 12,000+ rows). 
//         Each record will be uploaded <strong>individually</strong> with a new auto-generated Firestore ID.
//       </p> */}
//       <p style={{ color: 'red', fontWeight: 'bold' }}>
//         ⚠️ This action is password-protected for security.
//       </p>

//       <input
//         type="file"
//         accept=".csv,text/csv"
//         onChange={handleFileChange}
//         disabled={uploading}
//         style={{ display: 'block', marginBottom: '15px' }}
//       />

//       <button
//         onClick={handleUploadClick}
//         disabled={!file || uploading}
//         style={{
//           padding: '10px 20px',
//           background: uploading ? '#ccc' : '#0066ff',
//           color: 'white',
//           border: 'none',
//           borderRadius: '5px',
//           cursor: uploading || !file ? 'not-allowed' : 'pointer',
//         }}
//       >
//         {uploading ? 'Uploading & Processing...' : 'Upload CSV (Password Required)'}
//       </button>

//       {progress.total > 0 && (
//         <div style={{ marginTop: '20px' }}>
//           <p>Progress: {progress.current} / {progress.total} records processed</p>
//           <div style={{
//             width: '100%',
//             backgroundColor: '#f0f0f0',
//             borderRadius: '5px',
//             overflow: 'hidden'
//           }}>
//             <div style={{
//               width: `${(progress.current / progress.total) * 100}%`,
//               backgroundColor: '#0066ff',
//               height: '20px',
//               transition: 'width 0.3s'
//             }} />
//           </div>
//         </div>
//       )}

//       {message && (
//         <p
//           style={{
//             marginTop: '20px',
//             padding: '10px',
//             background: message.includes('Error') || message.includes('Parse') ? '#ffeeee' : '#eeffee',
//             borderRadius: '5px',
//             color: message.includes('Error') || message.includes('Parse') ? 'red' : 'green',
//           }}
//         >
//           {message}
//         </p>
//       )}

//       {/* Password Prompt Modal */}
//       {showPasswordPrompt && (
//         <div
//           style={{
//             position: 'fixed',
//             top: 0,
//             left: 0,
//             width: '100%',
//             height: '100%',
//             backgroundColor: 'rgba(0,0,0,0.6)',
//             display: 'flex',
//             alignItems: 'center',
//             justifyContent: 'center',
//             zIndex: 1000,
//           }}
//         >
//           <div
//             style={{
//               background: 'white',
//               padding: '30px',
//               borderRadius: '10px',
//               width: '90%',
//               maxWidth: '400px',
//               boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
//             }}
//           >
//             <h3 style={{ marginTop: 0 }}>Enter Password to Proceed</h3>
//             <p>This action requires authorization.</p>

//             <input
//               type="password"
//               value={passwordInput}
//               onChange={(e) => setPasswordInput(e.target.value)}
//               onKeyDown={(e) => e.key === 'Enter' && confirmUpload()}
//               placeholder="Enter password"
//               autoFocus
//               style={{
//                 width: '100%',
//                 padding: '10px',
//                 fontSize: '16px',
//                 marginBottom: '10px',
//                 border: '1px solid #ccc',
//                 borderRadius: '5px',
//               }}
//             />

//             {passwordError && (
//               <p style={{ color: 'red', margin: '10px 0' }}>{passwordError}</p>
//             )}

//             <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
//               <button
//                 onClick={() => {
//                   setShowPasswordPrompt(false);
//                   setPasswordError('');
//                 }}
//                 style={{
//                   padding: '8px 16px',
//                   background: '#ccc',
//                   border: 'none',
//                   borderRadius: '5px',
//                   cursor: 'pointer',
//                 }}
//               >
//                 Cancel
//               </button>
//               <button
//                 onClick={confirmUpload}
//                 style={{
//                   padding: '8px 16px',
//                   background: '#0066ff',
//                   color: 'white',
//                   border: 'none',
//                   borderRadius: '5px',
//                   cursor: 'pointer',
//                 }}
//               >
//                 Confirm Upload
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default CSVUploadComponent;


//
//
//
//NEWS lETTER


import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

const NewsletterDataMigrator = () => {
  const [status, setStatus] = useState('');

  const uploadNewsletterConfig = async () => {
    setStatus('Uploading...');
    
   const weeklyTemplate = {
  // ── Header & Greeting ───────────────────────────────────────
  mainTitle:        "Jobs & Earning Opportunities for Members",
  companyName:      "Brisk Olive Business Solutions Pvt Ltd",
  weeklySubtitle:   "Weekly Update",
  greeting:         `Dear All,\n\nThere are many exciting earning opportunities for you. Our industry partners are offering us job vacancies, temporary staffing assignments, part-time surveys/audits/consultancies, as well as projects, all to be undertaken by our ex-soldiers and other members. There are also internship and apprenticeship opportunities for your children abroad!\n\nIf you have any questions or need support or advice, please do not hesitate to contact us at members.manager@briskolive.com. Our team is ready to serve, and we look forward to working with you.\n\nWe wish you and your families all the best in the year ahead.\n\nSincerely,\nCol Sunil Prem\nMD & CEO, Brisk Olive Business Solutions Pvt. Ltd.`,

  // ── Introduction Section ────────────────────────────────────
  intro: {
    title: "A BRIEF INTRODUCTION TO BRISK OLIVE",
    text:  "Brisk Olive is a company founded by an ex-soldier that offers a wide array of services to its clients, ranging from Job Placements, Temporary Staffing, Surveys, Audits, Data Logging, Market Research, operations and maintenance, project execution, social impact assignments, Sourcing, and Training. We are well-equipped to handle scale assignments through our ex-soldiers field force. Here is a summary of our services:",
    clientsIntro: "Our Clients: Numerous companies, who are business leaders in their domains, avail our services. Here are a few sample customers."
  },

  // ── Images / Assets (use real public URLs or Firebase Storage) ──
  images: {
    mainLogo:           "https://briskolive.com/wp-content/uploads/.../logo1.png",
    servicesSummary:    "https://briskolive.com/wp-content/uploads/.../logo2.png",
    clientLogos:        "https://briskolive.com/wp-content/uploads/.../logo3.png",
    successStory1:      "https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=749036470601358",
    tempStaffingHeader: "https://briskolive.com/wp-content/uploads/.../logo6.png",
    examInvigilator:    "https://connex-education.com/wp-content/uploads/2025/04/New-Project-18-1.jpg",
    jewarAirport:       "https://briskolive.com/wp-content/uploads/.../logo9.jpg",
    solarOandM:         "https://briskolive.com/wp-content/uploads/.../logo7.jpg",
    defenceProject:     "https://briskolive.com/wp-content/uploads/2023/09/floods-1.jpg",
    // add more as needed...
  },

  // ── Jobs Section (static parts only) ─────────────────────────
  jobsSection: {
    title:              "1. Get jobs across India",
    description:        "You can get a job through us with companies like Accenture, Amazon, Bharti, Bajaj Electricals, Flipkart, Pharmeasy, etc. A list of open vacancies is given below. To get a job through us, please\nfill in your details in this form: https://forms.gle/UrAKH1y98j3q7QmT6. If your profile fits any of the\nexisting vacancies, we will get back to you. We will also contact you for future opportunities.",
    registrationLink:   "https://forms.gle/UrAKH1y98j3q7QmT6",
    registrationText:   "(a) Open Jobs from Brisk Olive",
    extraNote:          "Please fill out the form",
    alternativeRegLink: "https://script.google.com/a/briskolive.com/macros/s/AKfycbyrNSun6HSF2nXnET46zTt1g1VNBjBflykFk59hjUHhlnC_R6RbqhyPf_8gTpIJimZF/exec?v=newMember",
    successStoryText:   "Here's a recent success story - of a veteran placed through Brisk Olive:"
  },

  // ── Temp Staffing Section ───────────────────────────────────
  tempStaffing: {
    title: "2. Temporary Staffing Assignments for You",
    introText: `You can work as Exam Invigilators (Temporary Staff) through us, for companies like TCS and Aptech\n\nHundreds of our ex-soldiers are working for 1 to 20 days each month - through Brisk Olive - as part-time invigilators for government exams. Our city-coordinators - who are also ex-soldiers - help them in delivering these duties. For such a duty, you get paid a daily rate - you receive your payment by the end of the following month, for duties delivered by you during this month. If you too want to take on such duties, then please click the link in the last column below for your state. Our staff will get back to you:`,
    // The table with state-wise links should preferably be moved to its own collection
    // but for quick migration you can keep important links here:
    importantLinks: {
      "Uttar Pradesh": "https://forms.gle/px8C8wGVYiJi5wsH6",
      "Haryana":       "https://forms.gle/2JeKRCGQ2Hdrrydu9",
      // ... add more states when needed
    }
  },

  // ── Projects Section (static parts) ─────────────────────────
  projectsSection: {
    title:              "3. Work in our Projects / Surveys / Audits & Consultancies",
    intro:              "Apart from jobs and Temporary Staffing opportunities (as mentioned above) you could also earn by doing various projects with us...",
    otherProjectsTitle: "(b) Some Other Ongoing Projects, being executed by Brisk Olive.",
    jewarText:          "CSR at Jewar Airport, NIAL Our turn-key project execution teams (of mostly ex-soldiers) are executing diverse projects ranging from CSR (at the upcoming Jewar Airport next to Delhi NCR) to Operations & Maintenance assignments (at Rudrapur in Uttarakhand).",
    solarText:          "Solar: Our Solar O&M Managers (Operations and Maintenance Manager) are deployed in Rudrapur (Uttarakhand). We will let you know once more new opportunities are available in this field."
  },

  // ── Regional Partners & Defence ─────────────────────────────
  regionalPartners: {
    title: "4. Regional Partners",
    intro: "Brisk Olive has Regional Partners (ex-soldiers) in the following states.",
    becomePartnerText: "If you too are an enterprising ex-soldier, and want to become our Regional Partner, please fill this form:",
    partnerFormLink:   "https://script.google.com/a/briskolive.com/macros/s/AKfycbygIXSql_dd18Rv4lxclcmN9N8F_VrAwPrXCML8X5DiO5z4zuNxmascocMxnHPKjAYc/exec?v=newMember"
  },

  defence: {
    title: "6. Defence Projects",
    text:  "Brisk Olive is also doing Defence Projects for the Indian Army.\nHere are some interesting products built by us.\nThe Rapid Folding Floating Foot Assault Bridge for the Indian Army.\nIn partnership with the Ministry of Defence Production, we have developed a unique foot assault bridge, for our dismounted soldiers to attack an enemy across a water obstacle. This patented bridge is man portable and can be launched extremely fast across obstacles up to 50 to 100 meters wide.\nApart from the Indian Army, the bridge provides a versatile solution to our Paramilitary Forces, and Disaster Relief forces at the Center and State levels, to instantly restore communications and provide relief to affected communities."
  },

  aboutus:{
    tittle:"About Brisk Olive - Your Partner in Growth ",
    text: "Brisk Olive stands as a pioneer in the field of consultancy and operational support,providing an unmatched advantage through our 30,000+ strong community of skilledex-soldiers. Our unique strength lies in our highly reliable operational field force, eachmember possessing 15 to 20 years of experience across various domains. This expertise translates into exceptional reach, scale, and quality, ensuring that we consistently deliver on-time, on-cost, and on-quality results."
  },

  // ── Footer & General Links ──────────────────────────────────
  footer: {
    address:    "G-203 Sector 63 Noida Uttar Pradesh India",
    website:    "https://briskolive.com",
    email:      "info@briskolive.com",
    copyright:  "© 2026 Brisk Olive Business Solutions Pvt. Ltd.",
    quickLinks: [
      { text: "About Us",              url: "https://briskolive.com/about/" },
      { text: "Expert Field Services", url: "https://briskolive.com/expert-field-services/" },
      { text: "Recruitment Services",  url: "https://briskolive.com/recruitment/" },
      { text: "Members Page",          url: "https://briskolive.com/members-area/" },
      { text: "Contact Us",            url: "https://briskolive.com/contact/" },
    ]
  }
};

    try {
      // 2. Push to Firestore (using 'weekly_config' as the document ID)
      await setDoc(doc(db, 'newsletter_config', 'weekly_config'), weeklyTemplate);
      setStatus('Successfully uploaded all data to Firebase!');
    } catch (error) {
      console.error("Error uploading data: ", error);
      setStatus('Error: ' + error.message);
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px', margin: '20px' }}>
      <h3>Database Migration Tool</h3>
      <p>Click the button below to push all hardcoded text and image URLs to Firestore.</p>
      <button 
        onClick={uploadNewsletterConfig}
        style={{
          padding: '10px 20px',
          backgroundColor: '#4a7c2c',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Push All Data to DB
      </button>
      <p><strong>Status:</strong> {status}</p>
    </div>
  );
};

export default NewsletterDataMigrator;