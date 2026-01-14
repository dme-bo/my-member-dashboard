import React, { useState, useEffect } from 'react';
import Select, { components } from 'react-select';
import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  PDFDownloadLink,
  PDFViewer,
  Link,
  Image,
} from '@react-pdf/renderer';
import { collection, getDocs, query, where, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

// ── PDF Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: '#333',
    lineHeight: 1.5,
  },
  header: {
    marginBottom: 25,
    textAlign: 'center',
    borderBottom: '2 solid #4a7c2c',
    paddingBottom: 15,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#4a7c2c',
    marginBottom: 8,
  },
  subtitle: { fontSize: 14, color: '#555' },
  date: { fontSize: 10, color: '#666', marginTop: 5 },
  greeting: { marginBottom: 20, fontSize: 12, whiteSpace: 'pre-line' },
  section: { marginTop: 20, marginBottom: 15 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a365d',
    marginBottom: 8,
    borderBottom: '1 solid #eee',
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2c5e1f',
    marginTop: 12,
    marginBottom: 6,
  },
  bodyText: { marginBottom: 10, whiteSpace: 'pre-line' },
  bold: { fontWeight: 'bold' },
  link: { color: '#0066cc', textDecoration: 'underline' },
  table: {
    display: 'table',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 12,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #ddd',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderBottom: '1.5 solid #ccc',
    paddingVertical: 8,
  },
  tableCell: { flex: 1, paddingHorizontal: 4, fontSize: 10 },
  image: { marginVertical: 8, width: '100%', height: 'auto' },
  footer: {
    marginTop: 40,
    paddingTop: 15,
    borderTop: '1 solid #ccc',
    fontSize: 9,
    textAlign: 'center',
    color: '#555',
  },
});

// ── Helpers ──────────────────────────────────────────────────────────
const extractGoogleDriveFileId = (url) => {
  if (!url) return null;
  const patterns = [
    /\/d\/([a-zA-Z0-9_-]{25,})/,
    /\/open\?id=([a-zA-Z0-9_-]+)/,
    /uc\?id=([a-zA-Z0-9_-]+)/,
    /([a-zA-Z0-9_-]{25,})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
};

const getBase64FromUrl = async (url) => {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('Image load failed:', url);
    return null;
  }
};

// ── Data Fetching ────────────────────────────────────────────────────
const fetchOpenJobs = async () => {
  const q = query(collection(db, 'jobsmaster'), where('job_status', '==', 'Open'));
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

const fetchOpenProjects = async () => {
  const q = query(collection(db, 'projectsmaster'), where('project_status', '==', 'Active'));
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

const fetchRegionalPartners = async () => {
  const snap = await getDocs(collection(db, 'partneragentusersmaster'));
  const counts = snap.docs.reduce((acc, doc) => {
    const state = doc.data().state;
    if (state) acc[state] = (acc[state] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
};

const fetchNewsletterContent = async () => {
  const docRef = doc(db, 'newsletter_config', 'weekly_config');
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data();
  }
  console.warn('Newsletter config not found - using fallback values');
  return {};
};

const formatNewsletterDate = () => {
  const today = new Date();
  const day = today.getDate();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${monthNames[today.getMonth()]} ${today.getFullYear()}`;
};

// ── Custom react-select components ──────────────────────────────────
const CustomCheckboxOption = (props) => (
  <components.Option {...props}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={props.isSelected}
        readOnly
        style={{ width: '18px', height: '18px', accentColor: '#4a7c2c', cursor: 'pointer' }}
      />
      <span style={{ fontSize: '0.98rem', flex: 1 }}>{props.label}</span>
    </div>
  </components.Option>
);

const CustomMenu = (props) => {
  const { children, ...rest } = props;
  const options = props.options || [];
  const selected = props.getValue() || [];
  const isAllSelected = options.length > 0 && selected.length === options.length;

  const handleSelectAll = () => {
    if (isAllSelected) {
      props.setValue([], 'select-option');
    } else {
      props.setValue(options, 'select-option');
    }
  };

  return (
    <components.Menu {...rest}>
      {options.length > 0 && (
        <div
          style={{
            padding: '10px 12px',
            borderBottom: '1px solid #e0e0e0',
            backgroundColor: '#f9fafb',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer',
            fontWeight: isAllSelected ? '600' : '500',
            color: '#333',
          }}
          onClick={handleSelectAll}
        >
          <input
            type="checkbox"
            checked={isAllSelected}
            readOnly
            style={{ width: '18px', height: '18px', accentColor: '#4a7c2c', cursor: 'pointer' }}
          />
          <span>
            {isAllSelected ? 'Deselect All' : 'Select All'}
            <small style={{ color: '#666', marginLeft: '8px' }}>({options.length})</small>
          </span>
        </div>
      )}
      {children}
    </components.Menu>
  );
};

const customSelectStyles = {
  control: (base) => ({ ...base, minHeight: '52px', borderColor: '#ccc' }),
  valueContainer: (base) => ({
    ...base,
    maxHeight: '140px',
    overflowY: 'auto',
    padding: '6px 8px',
  }),
  multiValue: (base) => ({ ...base, backgroundColor: '#e8f5e9', borderRadius: '4px' }),
  multiValueLabel: (base) => ({ ...base, color: '#2c5e1f' }),
  multiValueRemove: (base) => ({
    ...base,
    color: '#2c5e1f',
    ':hover': { backgroundColor: '#d1e7dd', color: '#1a3c14' },
  }),
  menu: (base) => ({ ...base, zIndex: 1000 }),
};

// ── PDF Document Component ──────────────────────────────────────────
const NewsletterDocument = ({ jobs, projects, regionalPartners, content }) => {
  const {
    companyName = 'Brisk Olive Business Solutions Pvt Ltd',
    mainTitle = 'Jobs & Earning Opportunities for Members',
    weeklySubtitle = 'Weekly Update',
    greeting = '',
    intro = {},
    jobsSection = {},
    tempStaffing = {},
    projectsSection = {},
    regionalPartners: rpSettings = {},
    defence = {},
    footer = {},
    images = {},
    aboutus = {},
  } = content;

  const quickLinks = footer?.quickLinks || [];
  const currentDate = formatNewsletterDate();

  return (
    <Document>
      <Page style={styles.page} wrap>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{mainTitle}</Text>
          <Text style={styles.subtitle}>{companyName}</Text>
          <Text style={styles.date}>
            {weeklySubtitle}: {currentDate}
          </Text>
        </View>

        {images.mainLogo && <Image style={styles.image} src={images.mainLogo} />}

        <Text style={styles.greeting}>{greeting}</Text>

        {/* Introduction */}
        <View wrap={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{intro.title || 'A BRIEF INTRODUCTION TO BRISK OLIVE'}</Text>
            <Text style={styles.bodyText}>{intro.text}</Text>
            {images.servicesSummary && <Image style={styles.image} src={images.servicesSummary} />}
            <Text style={styles.bodyText}>{intro.clientsIntro}</Text>
            {images.clientLogos && <Image style={styles.image} src={images.clientLogos} />}
          </View>
        </View>

        {/* Opportunities Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            A SUMMARY OF EARNING & OTHER OPPORTUNITIES FOR BRISK OLIVE MEMBERS - {currentDate}
          </Text>

          {/* Jobs */}
          {jobs?.length > 0 && (
            <View>
              <Text style={styles.subsectionTitle}>{jobsSection.title || '1. Get jobs across India'}</Text>
              <Text style={styles.bodyText}>{jobsSection.description}</Text>
              <Text style={[styles.bodyText, { marginTop: 8, fontWeight: 'bold' }]}>
                {jobsSection.registrationText || 'Open Jobs from Brisk Olive:'}
              </Text>

              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={styles.tableCell}>Company</Text>
                  <Text style={styles.tableCell}>Industry</Text>
                  <Text style={styles.tableCell}>Designation</Text>
                  <Text style={styles.tableCell}>Location</Text>
                  <Text style={styles.tableCell}>Salary</Text>
                </View>
                {jobs.map((job, i) => (
                  <View key={i} style={styles.tableRow}>
                    <Text style={styles.tableCell}>{job.job_company || '-'}</Text>
                    <Text style={styles.tableCell}>{job.job_industry || '-'}</Text>
                    <Text style={styles.tableCell}>{job.job_title || '-'}</Text>
                    <Text style={styles.tableCell}>{job.job_location || '-'}</Text>
                    <Text style={styles.tableCell}>{job.job_salaryrange_maximum || '-'}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.bodyText}>
                To apply / register:{' '}
                <Link style={styles.link} src={jobsSection.registrationLink}>
                  {jobsSection.registrationLink}
                </Link>
              </Text>

              {jobsSection.successStoryText && (
                <View>
                  <Text style={[styles.bodyText, { marginTop: 10 }]}>{jobsSection.successStoryText}</Text>
                  {images.successStory && <Image style={styles.image} src={images.successStory} />}
                  {images.successStory1 && <Image style={styles.image} src={images.successStory1} />}
                </View>
              )}
            </View>
          )}

          {/* Temporary Staffing */}
          <View wrap={false}>
            <Text style={styles.subsectionTitle}>
              {tempStaffing.title || '2. Temporary Staffing Assignments for You'}
            </Text>
            <Text style={styles.bodyText}>{tempStaffing.introText}</Text>
            {images.examInvigilator && <Image style={styles.image} src={images.examInvigilator} />}

            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={styles.tableCell}>State</Text>
                <Text style={styles.tableCell}>Location</Text>
                <Text style={styles.tableCell}>Registration</Text>
              </View>
              {Object.entries(tempStaffing.importantLinks || {}).map(([state, link]) => (
                <View key={state} style={styles.tableRow}>
                  <Text style={styles.tableCell}>{state}</Text>
                  <Text style={styles.tableCell}>Various cities</Text>
                  <Text style={styles.tableCell}>
                    <Link src={link}>Register</Link>
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Projects */}
          {projects?.length > 0 && (
            <View>
              <Text style={styles.subsectionTitle}>
                {projectsSection.title || '3. Work in our Projects / Surveys / Audits & Consultancies'}
              </Text>
              <Text style={styles.bodyText}>{projectsSection.intro}</Text>

              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={styles.tableCell}>Ser</Text>
                  <Text style={styles.tableCell}>Project</Text>
                  <Text style={styles.tableCell}>Description</Text>
                  <Text style={styles.tableCell}>Apply</Text>
                </View>
                {projects.map((proj, i) => (
                  <View key={i} style={styles.tableRow}>
                    <Text style={styles.tableCell}>{String(i + 1).padStart(2, '0')}.</Text>
                    <Text style={styles.tableCell}>{proj.project_title || '-'}</Text>
                    <Text style={styles.tableCell}>{proj.project_description || '-'}</Text>
                    <Text style={styles.tableCell}>
                      <Link src={proj.project_apply_link || '#'}>{'Apply'}</Link>
                    </Text>
                  </View>
                ))}
              </View>

                <Text style={[styles.bodyText, { marginTop: 10 }]}>{projectsSection.otherProjectsTitle}</Text>
                <Text style={styles.bodyText}>{projectsSection.jewarText}</Text>
                {images.jewarAirport && <Image style={styles.image} src={images.jewarAirport} />}

                <Text style={styles.bodyText}>{projectsSection.solarText}</Text>
                {images.solarOandM && <Image style={styles.image} src={images.solarOandM} />}
            </View>
          )}

          {/* Regional Partners */}
          <View>
            <Text style={styles.subsectionTitle}>{rpSettings.title || '4. Regional Partners'}</Text>
            <Text style={styles.bodyText}>{rpSettings.intro}</Text>

            {regionalPartners.length === 0 ? (
              <Text style={styles.bodyText}>No regional partners registered yet.</Text>
            ) : (
              regionalPartners.map(([state, count], i) => (
                <Text key={state} style={styles.bodyText}>
                  {i + 1}. {state}: {count} partners
                </Text>
              ))
            )}

            <Text style={[styles.bodyText, { marginTop: 12 }]}>
              {rpSettings.becomePartnerText}{' '}
              <Link style={styles.link} src={rpSettings.partnerFormLink}>
                Become a Regional Partner
              </Link>
            </Text>
          </View>

          {/* Defence Projects */}
          <View wrap={false}>
            <Text style={styles.subsectionTitle}>{defence.title || '5. Defence Projects'}</Text>
            <Text style={styles.bodyText}>{defence.text}</Text>
            {images.defenceProject && <Image style={styles.image} src={images.defenceProject} />}
          </View>

          {/* About Us + Quick Links */}
          <View wrap={false}>
            <View style={{ marginTop: 25, marginBottom: 20 }}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{aboutus.title || 'About Brisk Olive - Your Partner in Growth'}</Text>
                <Text style={styles.bodyText}>{aboutus.text}</Text>
              </View>

              {quickLinks.length === 0 ? (
                <Text style={styles.bodyText}>(No quick links configured)</Text>
              ) : (
                quickLinks.map((link, i) => {
                  let fullUrl = link.url || '';
                  if (fullUrl && !fullUrl.startsWith('http')) {
                    fullUrl = `https://briskolive.com${fullUrl.startsWith('/') ? '' : '/'}${fullUrl}`;
                  }
                  return (
                    <Text key={i} style={styles.bodyText}>
                      <Link style={styles.link} src={fullUrl}>
                        → {link.text || 'Link'}
                      </Link>
                    </Text>
                  );
                })
              )}
            </View>
          </View>

          {/* Closing */}
          <Text style={{ marginTop: 30, fontSize: 12 }}>
            Thanks!{'\n\n'}
            (Team Brisk Olive){'\n'}
          </Text>

          {/* Footer */}
          <View style={styles.footer}>
            <Text>{companyName}</Text>
            <Text>{footer.address || 'G-203 Sector 63 Noida Uttar Pradesh India'}</Text>
            <Text>
              Visit us at:{' '}
              <Link src={footer.website || 'https://briskolive.com'}>
                {footer.website || 'https://briskolive.com'}
              </Link>
            </Text>
            <Text>{footer.email || 'info@briskolive.com'}</Text>
            <Text>{footer.copyright || `© ${new Date().getFullYear()} Brisk Olive Business Solutions Pvt. Ltd.`}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};

// ── MAIN COMPONENT ────────────────────────────────────────────────────
export default function BriskOliveNewsletterApp() {
  const [jobs, setJobs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [regionalPartners, setRegionalPartners] = useState([]);
  const [content, setContent] = useState({});
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState({});

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [jobsData, projectsData, partnersData, contentData] = await Promise.all([
          fetchOpenJobs(),
          fetchOpenProjects(),
          fetchRegionalPartners(),
          fetchNewsletterContent(),
        ]);

        const processedImages = {};
        if (contentData?.images) {
          for (const key of Object.keys(contentData.images)) {
            const base64 = await getBase64FromUrl(contentData.images[key]);
            if (base64) processedImages[key] = base64;
          }
        }

        const finalContent = { ...contentData, images: processedImages };
        setJobs(jobsData);
        setProjects(projectsData);
        setRegionalPartners(partnersData);
        setContent(finalContent);

        // Prepare clean copy for editing (original URLs only)
        setEditedContent(structuredClone({ ...contentData, images: contentData.images || {} }));
      } catch (err) {
        console.error('Data loading error:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const jobOptions = jobs.map(j => ({
    value: j.id,
    label: `${j.job_company || '?'} • ${j.job_title || 'Position'}`
  }));

  const projectOptions = projects.map(p => ({
    value: p.id,
    label: p.project_title || 'Project'
  }));

  const filteredJobs = jobs.filter(j => selectedJobs.some(s => s.value === j.id));
  const filteredProjects = projects.filter(p => selectedProjects.some(s => s.value === p.id));

  // ── Edit Handlers ──────────────────────────────────────────────────
  const updateNestedField = (path, value) => {
    setEditedContent(prev => {
      const copy = structuredClone(prev);
      const parts = path.split('.');
      let current = copy;
      for (let i = 0; i < parts.length - 1; i++) {
        current[parts[i]] = current[parts[i]] || {};
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
      return copy;
    });
  };

  const handleSave = async () => {
    if (!window.confirm('Save changes to newsletter configuration?')) return;

    try {
      const docRef = doc(db, 'newsletter_config', 'weekly_config');
      await updateDoc(docRef, {
        ...editedContent,
        // Important: keep original image URLs, not base64
        images: content.images
          ? Object.fromEntries(
              Object.entries(content.images).map(([k]) => [k, contentData?.images?.[k] || ''])
            )
          : {}
      });

      setContent(prev => ({
        ...prev,
        ...editedContent,
        images: prev.images // keep processed base64 for preview
      }));

      alert('Configuration saved successfully!');
      setIsEditing(false);
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save changes: ' + err.message);
    }
  };

  const Field = ({ label, path, type = 'text', rows = 3 }) => {
    const parts = path.split('.');
    let value = editedContent;
    for (const p of parts) {
      value = value?.[p] ?? '';
    }

    return (
      <div className="edit-field">
        <label>{label}</label>
        {type === 'textarea' ? (
          <textarea
            value={value}
            onChange={e => updateNestedField(path, e.target.value)}
            rows={rows}
          />
        ) : (
          <input
            type={type}
            value={value}
            onChange={e => updateNestedField(path, e.target.value)}
          />
        )}
      </div>
    );
  };

  if (loading) return <div className="loading">Loading newsletter data...</div>;

  return (
    <div className="newsletter-app">
      <header className="app-header">
        <h1>Weekly Newsletter</h1>
        <button
          type="button"                    // ← Prevents refresh
          className="edit-btn"
          onClick={() => setIsEditing(true)}
        >
          Edit Content
        </button>
      </header>

      <div className="selectors-container">
        <div className="select-card">
          <label>Select Jobs ({selectedJobs.length}/{jobOptions.length})</label>
          <Select
            isMulti
            closeMenuOnSelect={false}
            components={{ Option: CustomCheckboxOption, Menu: CustomMenu }}
            options={jobOptions}
            value={selectedJobs}
            onChange={setSelectedJobs}
            placeholder="Select jobs to include..."
            styles={customSelectStyles}
          />
        </div>

        <div className="select-card">
          <label>Select Projects ({selectedProjects.length}/{projectOptions.length})</label>
          <Select
            isMulti
            closeMenuOnSelect={false}
            components={{ Option: CustomCheckboxOption, Menu: CustomMenu }}
            options={projectOptions}
            value={selectedProjects}
            onChange={setSelectedProjects}
            placeholder="Select projects to include..."
            styles={customSelectStyles}
          />
        </div>
      </div>

      <div className="preview-container">
        <PDFViewer className="pdf-viewer">
          <NewsletterDocument
            jobs={filteredJobs}
            projects={filteredProjects}
            regionalPartners={regionalPartners}
            content={content}
          />
        </PDFViewer>
      </div>

      <div className="download-section">
        <PDFDownloadLink
          document={
            <NewsletterDocument
              jobs={filteredJobs}
              projects={filteredProjects}
              regionalPartners={regionalPartners}
              content={content}
            />
          }
          fileName={`Newsletter_${formatNewsletterDate().replace(/ /g, '_')}.pdf`}
          className="download-btn"
        >
          {({ loading }) => (
            <button type="button" disabled={loading} className="download-btn-inner">
              {loading ? 'Generating...' : 'Download PDF'}
            </button>
          )}
        </PDFDownloadLink>
      </div>

      {/* ── EDIT MODAL ─────────────────────────────────────────────── */}
      {isEditing && (
        <div className="modal-overlay">
          <div className="edit-modal">
            <div className="modal-header">
              <h2>Edit Newsletter Content</h2>
              <button
                type="button"               // ← Prevents refresh
                className="close-btn"
                onClick={() => setIsEditing(false)}
              >
                ×
              </button>
            </div>

            <div className="edit-sections">
              <section>
                <h3>Header & Greeting</h3>
                <Field label="Company Name" path="companyName" />
                <Field label="Main Title" path="mainTitle" />
                <Field label="Weekly Subtitle" path="weeklySubtitle" />
                <Field label="Greeting Message" path="greeting" type="textarea" rows={5} />
              </section>

              <section>
                <h3>Introduction Section</h3>
                <Field label="Intro Title" path="intro.title" />
                <Field label="Intro Text" path="intro.text" type="textarea" rows={8} />
                <Field label="Clients Intro" path="intro.clientsIntro" type="textarea" rows={4} />
              </section>

              <section>
                <h3>Jobs Section</h3>
                <Field label="Section Title" path="jobsSection.title" />
                <Field label="Description" path="jobsSection.description" type="textarea" rows={5} />
                <Field label="Registration Text" path="jobsSection.registrationText" />
                <Field label="Registration Link" path="jobsSection.registrationLink" />
                <Field label="Success Story Text" path="jobsSection.successStoryText" type="textarea" rows={4} />
              </section>

              <section>
                <h3>Projects Section</h3>
                <Field label="Section Title" path="projectsSection.title" />
                <Field label="Intro Text" path="projectsSection.intro" type="textarea" rows={5} />
                <Field label="Other Projects Title" path="projectsSection.otherProjectsTitle" />
                <Field label="Jewar Airport Text" path="projectsSection.jewarText" type="textarea" rows={4} />
                <Field label="Solar O&M Text" path="projectsSection.solarText" type="textarea" rows={4} />
              </section>

              {/* You can continue adding more Field components for other sections */}
            </div>

            <div className="modal-actions">
              <button
                type="button"               // ← Prevents refresh
                className="cancel-btn"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </button>

              <button
                type="button"               // ← The most important one!
                className="save-btn"
                onClick={handleSave}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Basic CSS - put in separate file or use styled-components in real project */}
      <style jsx global>{`
        .newsletter-app {
          font-family: 'Segoe UI', system-ui, sans-serif;
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem 1.5rem;
        }

        .app-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2.5rem;
          gap: 340px;
        }

        .app-header h1 {
  color: white;                    /* text color */
  background-color: #1e40af;       /* nice blue background */
  font-size: 2.9rem;
  margin: 0;
  padding: 1.2rem 8rem;           /* some inner spacing - looks better with background */
  border-radius: 12px;            /* modern rounded corners - you can change to 8px/16px/20px */
  display: inline-block;          /* important - makes the background hug the text */
}

        .edit-btn {
          background: #1e40af;
          color: white;
          border: none;
          padding: 0.8rem 1.8rem;
          border-radius: 8px;
          font-size: 1.1rem;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }

        .edit-btn:hover { background: #1e40af; }

        .selectors-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          margin-bottom: 2.5rem;
        }

        .select-card {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }

        .select-card label {
          display: block;
          font-weight: 600;
          margin-bottom: 0.8rem;
          color: #1e40af;
        }

        .preview-container {
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 8px 30px rgba(0,0,0,0.12);
          margin-bottom: 2rem;
          height: 800px;
          background: white;
        }

        .pdf-viewer {
          width: 100%;
          height: 100%;
          border: none;
        }

        .download-section {
          text-align: center;
        }

        .download-btn {
          background: #1e40af;
          color: white;
          padding: 1rem 3rem;
          border-radius: 10px;
          text-decoration: none;
          font-size: 1.3rem;
          font-weight: bold;
          box-shadow: 0 4px 16px rgba(21,128,61,0.3);
          display: inline-block;
        }

        .download-btn:hover { background: #1e40af; }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.65);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: 1rem;
        }

        .edit-modal {
          background: white;
          border-radius: 16px;
          width: 100%;
          max-width: 1155px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0,0,0,0.4);
        }

        .modal-header {
          padding: 1.5rem 2rem;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: sticky;
          top: 0;
          background: white;
          z-index: 10;
        }

        .modal-header h2 {
          margin: 0;
          color: #1e40af;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 2rem;
          cursor: pointer;
          color: #6b7280;
        }

        .edit-sections {
          padding: 1.5rem 2rem;
        }

        .edit-sections section {
          margin-bottom: 2.5rem;
        }

        .edit-sections h3 {
          color: #1e40af;
          margin: 0 0 1.2rem 0;
          font-size: 1.4rem;
          border-bottom: 2px solid #dcfce7;
          padding-bottom: 0.5rem;
        }

        .edit-field {
          margin-bottom: 1.6rem;
        }

        .edit-field label {
          display: block;
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: #374151;
        }

        .edit-field input,
        .edit-field textarea {
          width: 100%;
          padding: 0.75rem 1rem;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 1rem;
          font-family: inherit;
          background-color: white;
          color: black;
        }

        .edit-field textarea {
          min-height: 100px;
          resize: vertical;
        }

        .modal-actions {
          padding: 1.5rem 2rem;
          border-top: 1px solid #e5e7eb;
          text-align: right;
        }

        .cancel-btn, .save-btn {
          padding: 0.9rem 2rem;
          border-radius: 8px;
          font-size: 1.05rem;
          cursor: pointer;
        }

        .cancel-btn {
          background: light-red;
          border: none;
          margin-right: 1rem;
        }

        .save-btn {
          background: #1e40af;
          color: white;
          border: none;
        }

        .loading {
          text-align: center;
          padding: 8rem 2rem;
          font-size: 1.4rem;
          color: #4b5563;
        }
          .download-btn-inner {
          background: #1e40af;
          color: white;
          padding: 1rem 3rem;
          border: none;
          border-radius: 10px;
          font-size: 1.3rem;
          font-weight: bold;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(21,128,61,0.3);
        }
        
        .download-btn-inner:disabled {
          background: #6b7280;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}