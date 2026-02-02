import React, { useState, useEffect, useRef } from 'react';
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

// ── PDF Styles ─────────────────────────────────────────────────────────────
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

// ── Helpers ────────────────────────────────────────────────────────────────
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

// ── Custom react-select components ─────────────────────────────────────────
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

// ── PDF Document Component (full structure) ────────────────────────────────
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
  } = content || {};

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

          {/* About Us */}
          <View wrap={false}>
            <View style={{ marginTop: 25, marginBottom: 20 }}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {aboutus.title || 'About Brisk Olive - Your Partner in Growth'}
                </Text>
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

// ── Editable Field Component ───────────────────────────────────────────────
const EditableField = ({ label, value, onChange, type = 'text', rows = 4 }) => (
  <div className="modal-edit-field">
    <label>{label}</label>
    {type === 'textarea' ? (
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
      />
    ) : (
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    )}
  </div>
);


// ── Main Component ─────────────────────────────────────────────────────────
export default function BriskOliveNewsletterApp() {
  const [jobs, setJobs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [regionalPartners, setRegionalPartners] = useState([]);
  const [content, setContent] = useState({});
  const [editedContent, setEditedContent] = useState({});
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const scrollContainerRef = useRef(null);
  const scrollPosition = useRef(0);

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
          for (const [key, url] of Object.entries(contentData.images)) {
            const base64 = await getBase64FromUrl(url);
            if (base64) processedImages[key] = base64;
          }
        }

        const fullContent = { ...contentData, images: processedImages };
        setJobs(jobsData);
        setProjects(projectsData);
        setRegionalPartners(partnersData);
        setContent(fullContent);
        setEditedContent(structuredClone(contentData || {}));
      } catch (err) {
        console.error('Data loading error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    if (showEditModal || showConfirmModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showEditModal, showConfirmModal]);

  const saveScroll = () => {
    if (scrollContainerRef.current) {
      scrollPosition.current = scrollContainerRef.current.scrollTop;
    }
  };

  const restoreScroll = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollPosition.current;
    }
  };

  useEffect(() => {
    if (showEditModal) {
      const timer = setTimeout(restoreScroll, 10);
      return () => clearTimeout(timer);
    }
  }, [editedContent, showEditModal]);

  const updateField = (path, value) => {
    saveScroll();
    setEditedContent((prev) => {
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

  const getChangedFields = (original, modified) => {
    const changes = {};

    const compareObjects = (obj1, obj2, prefix = '') => {
      if (!obj1 || !obj2) return;

      Object.keys(obj2).forEach(key => {
        const path = prefix ? `${prefix}.${key}` : key;
        const val1 = obj1[key];
        const val2 = obj2[key];

        if (typeof val2 === 'object' && val2 !== null && !Array.isArray(val2)) {
          compareObjects(val1, val2, path);
        } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
          changes[path] = val2;
        }
      });
    };

    compareObjects(original, modified);
    return changes;
  };

  const performSave = async () => {
    try {
      const docRef = doc(db, 'newsletter_config', 'weekly_config');

      const changes = getChangedFields(content, editedContent);

      if ('images' in changes) {
        changes.images = Object.fromEntries(
          Object.entries(changes.images || {}).map(([k, v]) => [
            k,
            typeof v === 'string' ? v : content.images?.[k] || ''
          ])
        );
      }

      if (Object.keys(changes).length === 0) {
        setToast({ show: true, message: 'No changes to save!', type: 'info' });
        setShowEditModal(false);
        return;
      }

      await updateDoc(docRef, changes);

      const newImages = { ...content.images };
      for (const [key, url] of Object.entries(changes.images || {})) {
        const base64 = await getBase64FromUrl(url);
        if (base64) newImages[key] = base64;
      }

      setContent(prev => ({
        ...prev,
        ...editedContent,
        images: newImages,
      }));

      setToast({
        show: true,
        message: `Successfully saved ${Object.keys(changes).length} change(s)!`,
        type: 'success'
      });

      setShowEditModal(false);
    } catch (err) {
      console.error('Save failed:', err);
      setToast({
        show: true,
        message: 'Failed to save: ' + (err.message || 'Unknown error'),
        type: 'error'
      });
    }
  };

  const handleSaveClick = () => {
    const changes = getChangedFields(content, editedContent);
    if (Object.keys(changes).length === 0) {
      setToast({ show: true, message: 'No changes detected!', type: 'info' });
      return;
    }
    setShowConfirmModal(true);
  };

  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast({ show: false, message: '', type: '' });
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast.show]);

  const jobOptions = jobs.map((j) => ({
    value: j.id,
    label: `${j.job_company || '?'} • ${j.job_title || 'Position'}`,
  }));

  const projectOptions = projects.map((p) => ({
    value: p.id,
    label: `${p.project_company || '?'} • ${p.project_title || 'Project'}`,
  }));

  const filteredJobs = jobs.filter((j) => selectedJobs.some((s) => s.value === j.id));
  const filteredProjects = projects.filter((p) => selectedProjects.some((s) => s.value === p.id));

    if (loading) {
    return (
      <div style={{ height: "100vh", width: "87vw",padding: "60px", textAlign: "center", fontSize: "18px", }}>
        Loading Newsletter...
      </div>
    );
  }

  return (
    <div className="newsletter-app">

      <header className="app-header">
        <button
          type="button"
          className="edit-content-btn"
          onClick={() => {
            setEditedContent(structuredClone(content || {}));
            setShowEditModal(true);
          }}
        >
          Edit Content
        </button>
      </header>

      <div className="selectors-container">
        <div className="select-group">
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

        <div className="select-group">
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

      <div className="pdf-preview-container">
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
        >
          {({ loading }) => (
            <button type="button" disabled={loading} className="download-btn">
              {loading ? 'Generating...' : 'Download PDF'}
            </button>
          )}
        </PDFDownloadLink>
      </div>

      {/* ── EDIT MODAL ────────────────────────────────────────────────────── */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="edit-modal">

            <div className="modal-header">
              <h2>Edit Newsletter Content</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowEditModal(false)}
              >
                ×
              </button>
            </div>

            <div
              className="modal-content-scroll"
              ref={scrollContainerRef}
              onScroll={saveScroll}
            >
              <section>
                <h3>Header & Greeting</h3>
                <EditableField label="Company Name" value={editedContent.companyName} onChange={v => updateField('companyName', v)} />
                <EditableField label="Main Title" value={editedContent.mainTitle} onChange={v => updateField('mainTitle', v)} />
                <EditableField label="Weekly Subtitle" value={editedContent.weeklySubtitle} onChange={v => updateField('weeklySubtitle', v)} />
                <EditableField label="Greeting Message" value={editedContent.greeting} onChange={v => updateField('greeting', v)} type="textarea" rows={6} />
              </section>

              <section>
                <h3>Introduction</h3>
                <EditableField label="Intro Title" value={editedContent.intro?.title} onChange={v => updateField('intro.title', v)} />
                <EditableField label="Intro Text" value={editedContent.intro?.text} onChange={v => updateField('intro.text', v)} type="textarea" rows={10} />
                <EditableField label="Clients Intro Text" value={editedContent.intro?.clientsIntro} onChange={v => updateField('intro.clientsIntro', v)} type="textarea" rows={5} />
              </section>

              <section>
                <h3>Jobs Section</h3>
                <EditableField label="Section Title" value={editedContent.jobsSection?.title} onChange={v => updateField('jobsSection.title', v)} />
                <EditableField label="Description" value={editedContent.jobsSection?.description} onChange={v => updateField('jobsSection.description', v)} type="textarea" rows={8} />
                <EditableField label="Registration Text" value={editedContent.jobsSection?.registrationText} onChange={v => updateField('jobsSection.registrationText', v)} />
                <EditableField label="Registration Link" value={editedContent.jobsSection?.registrationLink} onChange={v => updateField('jobsSection.registrationLink', v)} />
                <EditableField label="Success Story Text" value={editedContent.jobsSection?.successStoryText} onChange={v => updateField('jobsSection.successStoryText', v)} type="textarea" rows={5} />
              </section>

              <section>
                <h3>Temporary Staffing</h3>
                <EditableField label="Section Title" value={editedContent.tempStaffing?.title} onChange={v => updateField('tempStaffing.title', v)} />
                <EditableField label="Intro Text" value={editedContent.tempStaffing?.introText} onChange={v => updateField('tempStaffing.introText', v)} type="textarea" rows={6} />
              </section>

              <section>
                <h3>Projects Section</h3>
                <EditableField label="Section Title" value={editedContent.projectsSection?.title} onChange={v => updateField('projectsSection.title', v)} />
                <EditableField label="Intro Text" value={editedContent.projectsSection?.intro} onChange={v => updateField('projectsSection.intro', v)} type="textarea" rows={8} />
                <EditableField label="Other Projects Title" value={editedContent.projectsSection?.otherProjectsTitle} onChange={v => updateField('projectsSection.otherProjectsTitle', v)} />
                <EditableField label="Jewar Airport Text" value={editedContent.projectsSection?.jewarText} onChange={v => updateField('projectsSection.jewarText', v)} type="textarea" rows={5} />
                <EditableField label="Solar O&M Text" value={editedContent.projectsSection?.solarText} onChange={v => updateField('projectsSection.solarText', v)} type="textarea" rows={5} />
              </section>

              <section>
                <h3>Regional Partners</h3>
                <EditableField label="Section Title" value={editedContent.regionalPartners?.title} onChange={v => updateField('regionalPartners.title', v)} />
                <EditableField label="Intro Text" value={editedContent.regionalPartners?.intro} onChange={v => updateField('regionalPartners.intro', v)} type="textarea" rows={6} />
                <EditableField label="Become Partner Text" value={editedContent.regionalPartners?.becomePartnerText} onChange={v => updateField('regionalPartners.becomePartnerText', v)} type="textarea" rows={4} />
                <EditableField label="Partner Form Link" value={editedContent.regionalPartners?.partnerFormLink} onChange={v => updateField('regionalPartners.partnerFormLink', v)} />
              </section>

              <section>
                <h3>Defence Projects</h3>
                <EditableField label="Section Title" value={editedContent.defence?.title} onChange={v => updateField('defence.title', v)} />
                <EditableField label="Main Text" value={editedContent.defence?.text} onChange={v => updateField('defence.text', v)} type="textarea" rows={6} />
              </section>

              <section>
                <h3>About Us</h3>
                <EditableField label="Section Title" value={editedContent.aboutus?.title} onChange={v => updateField('aboutus.title', v)} />
                <EditableField label="Main Text" value={editedContent.aboutus?.text} onChange={v => updateField('aboutus.text', v)} type="textarea" rows={8} />
              </section>

              <section>
                <h3>Footer</h3>
                <EditableField label="Address" value={editedContent.footer?.address} onChange={v => updateField('footer.address', v)} />
                <EditableField label="Website URL" value={editedContent.footer?.website} onChange={v => updateField('footer.website', v)} />
                <EditableField label="Email" value={editedContent.footer?.email} onChange={v => updateField('footer.email', v)} />
                <EditableField label="Copyright Text" value={editedContent.footer?.copyright} onChange={v => updateField('footer.copyright', v)} />
              </section>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="modal-cancel-btn"
                onClick={() => setShowEditModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-save-btn"
                onClick={handleSaveClick}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRMATION MODAL ────────────────────────────────────────────── */}
      {showConfirmModal && (
        <div className="modal-overlay" style={{ zIndex: 3000 }}>
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '420px',
              width: '90%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              textAlign: 'center'
            }}
          >
            <h3 style={{ marginTop: 0, color: '#1976d2' }}>Save Changes?</h3>
            <p style={{ color: '#4b5563', margin: '1rem 0 1.8rem' }}>
              This will update the newsletter configuration with the modified fields.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                className="modal-cancel-btn"
                onClick={() => setShowConfirmModal(false)}
                style={{ minWidth: '100px' }}
              >
                Cancel
              </button>
              <button
                className="modal-save-btn"
                onClick={() => {
                  setShowConfirmModal(false);
                  performSave();
                }}
                style={{ minWidth: '100px' }}
              >
                Yes, Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST NOTIFICATION ────────────────────────────────────────────── */}
      {toast.show && (
        <div
          style={{
      position: 'fixed',
      top: '24px',                    // ← Changed from bottom
      right: '24px',
      padding: '14px 24px',
      borderRadius: '8px',
      color: 'white',
      fontWeight: '500',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      backgroundColor:
        toast.type === 'error' ? '#dc2626' :
        toast.type === 'info' ? '#6b7280' : '#16a34a',
      zIndex: 4000,
      transition: 'all 0.4s ease',
      transform: toast.show ? 'translateY(0)' : 'translateY(-20px)',
      opacity: toast.show ? 1 : 0,
    }}
        >
          {toast.message}
        </div>
      )}

      {/* ── STYLES ───────────────────────────────────────────────────────────── */}
      <style jsx global>{`

      html, body, #root, .app-wrapper, main {
  width: 100% !important;
  max-width: 100% !important;
  overflow-x: hidden !important;
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
}
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
          gap: 342px;
        }

        .app-header h1 {
              color: white;
    background-color: #1976d2;
    font-size: 2.9rem;
    margin: 0;
    padding: 1.2rem 8rem;
    border-radius: 12px;
    display: inline-block;
        }

        .edit-content-btn {
          background: #1976d2;
          color: white;
          border: none;
          padding: 0.8rem 1.8rem;
          border-radius: 8px;
          cursor: pointer;
          font-size: 1.1rem;
          margin-left: auto;
        }

        .selectors-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          margin-bottom: 2.5rem;
        }

        .select-group label {
          display: block;
          font-weight: 600;
          margin-bottom: 0.6rem;
          color: #1976d2;
        }

        .pdf-preview-container {
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 8px 30px rgba(0,0,0,0.12);
          margin-bottom: 2rem;
          height: 900px;
          background: white;
          min-width: 100%;
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
          background: #1976d2;
          color: white;
          padding: 1rem 3rem;
          border: none;
          border-radius: 10px;
          font-size: 1.3rem;
          cursor: pointer;
        }

        .download-btn:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }

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
          max-width: 1150px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0,0,0,0.4);
          overflow: hidden;
        }

        .modal-header {
          padding: 1.4rem 2rem;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .modal-close-btn {
          background: none;
          border: none;
          font-size: 2.4rem;
          cursor: pointer;
          color: white;
        }

        .modal-content-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 1.6rem 2.2rem;
          -webkit-overflow-scrolling: touch;
        }

        .modal-edit-field {
          margin-bottom: 1.8rem;
        }

        .modal-edit-field label {
          display: block;
          font-weight: 600;
          margin-bottom: 0.6rem;
          color: #1f2937;
        }

        .modal-edit-field input,
        .modal-edit-field textarea {
          width: 100%;
          padding: 0.8rem 1rem;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 1rem;
          font-family: inherit;
          background: white;
          color: black;
        }

        .modal-edit-field textarea {
          min-height: 120px;
          resize: vertical;
        }

        .modal-footer {
          padding: 1.4rem 2rem;
          border-top: 1px solid #e5e7eb;
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          background: white;
          position: sticky;
          bottom: 0;
          z-index: 10;
        }

        .modal-cancel-btn,
        .modal-save-btn {
          padding: 0.8rem 1.6rem;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-size: 1.05rem;
        }

        .modal-cancel-btn {
          background: #d1d5db;
          color: #374151;
        }

        .modal-save-btn {
          background: #1976d2;
          color: white;
        }

        .loading {
          text-align: center;
          padding: 8rem 0;
          font-size: 1.4rem;
          color: #4b5563;
        }
          
      `}</style>

      
    </div>
  );
}