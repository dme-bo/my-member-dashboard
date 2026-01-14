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
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
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

// ── Helpers for Google Drive → Base64 ─────────────────────────────────
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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{intro.title || 'A BRIEF INTRODUCTION TO BRISK OLIVE'}</Text>
          <Text style={styles.bodyText}>{intro.text}</Text>
          {images.servicesSummary && <Image style={styles.image} src={images.servicesSummary} />}
          <Text style={styles.bodyText}>{intro.clientsIntro}</Text>
          {images.clientLogos && <Image style={styles.image} src={images.clientLogos} />}
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
                <>
                  <Text style={[styles.bodyText, { marginTop: 10 }]}>{jobsSection.successStoryText}</Text>
                  {images.successStory && <Image style={styles.image} src={images.successStory} />}
                  {images.successStory1 && <Image style={styles.image} src={images.successStory1} />}
                </>
              )}
            </View>
          )}

          {/* Temporary Staffing */}
          <View>
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
                      <Link src={proj.project_apply_link || '#'}>Apply</Link>
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
          <View>
            <Text style={styles.subsectionTitle}>{defence.title || '5. Defence Projects'}</Text>
            <Text style={styles.bodyText}>{defence.text}</Text>
            {images.defenceProject && <Image style={styles.image} src={images.defenceProject}></Image>}
          </View>

          {/* Quick Links + About */}
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

          {/* Closing */}
          <Text style={{ marginTop: 30, fontSize: 12 }}>
            Thanks!{'\n\n'}
            (Team Brisk Olive){'\n'}
            Col Sunil Prem{'\n'}
            MD & CEO
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

// ── Main Component ───────────────────────────────────────────────────
export default function BriskOliveNewsletterApp() {
  const [jobs, setJobs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [regionalPartners, setRegionalPartners] = useState([]);
  const [content, setContent] = useState({});
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        const [jobsData, projectsData, partnersData, contentData] = await Promise.all([
          fetchOpenJobs(),
          fetchOpenProjects(),
          fetchRegionalPartners(),
          fetchNewsletterContent(),
        ]);

        // Convert all Google Drive images to base64
        const processedImages = {};
        if (contentData?.images) {
          const imageKeys = Object.keys(contentData.images);
          
          await Promise.all(
            imageKeys.map(async (key) => {
              const base64 = await getBase64FromUrl(contentData.images[key]);
              if (base64) {
                processedImages[key] = base64;
              } else {
                console.warn(`Failed to convert image to base64: ${key}`);
              }
            })
          );
        }

        setJobs(jobsData);
        setProjects(projectsData);
        setRegionalPartners(partnersData);
        setContent({
          ...contentData,
          images: processedImages, // ← now contains data:image/... strings
        });
      } catch (err) {
        console.error('Failed to load newsletter data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const jobOptions = jobs.map((job) => ({
    value: job.id,
    label: `${job.job_company || '?'} • ${job.job_title || 'Position'}`,
  }));

  const projectOptions = projects.map((proj) => ({
    value: proj.id,
    label: proj.project_title || 'Project',
  }));

  const filteredJobs = jobs.filter((j) => selectedJobs.some((s) => s.value === j.id));
  const filteredProjects = projects.filter((p) => selectedProjects.some((s) => s.value === p.id));

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '120px 20px' }}>Loading newsletter data & converting images...</div>;
  }

  return (
    <div
      style={{
        fontFamily: 'Arial, Helvetica, sans-serif',
        padding: 'clamp(24px, 4vw, 48px) clamp(16px, 3vw, 32px)',
        maxWidth: '1800px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      <h1
        style={{
          color: '#4a7c2c',
          textAlign: 'center',
          marginBottom: '40px',
          fontSize: '3.5rem',
        }}
      >
        Brisk Olive Weekly Newsletter Generator
      </h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '40px',
          marginBottom: '50px',
        }}
      >
        <div>
          <label
            style={{
              display: 'block',
              marginBottom: '12px',
              fontWeight: 'bold',
              color: '#2c5e1f',
            }}
          >
            Select Jobs to Include ({selectedJobs.length} / {jobOptions.length})
          </label>
          <Select
            isMulti
            closeMenuOnSelect={false}
            hideSelectedOptions={false}
            components={{ Option: CustomCheckboxOption, Menu: CustomMenu }}
            options={jobOptions}
            value={selectedJobs}
            onChange={setSelectedJobs}
            placeholder="Choose jobs to show in newsletter..."
            styles={customSelectStyles}
          />
        </div>

        <div>
          <label
            style={{
              display: 'block',
              marginBottom: '12px',
              fontWeight: 'bold',
              color: '#2c5e1f',
            }}
          >
            Select Projects to Include ({selectedProjects.length} / {projectOptions.length})
          </label>
          <Select
            isMulti
            closeMenuOnSelect={false}
            hideSelectedOptions={false}
            components={{ Option: CustomCheckboxOption, Menu: CustomMenu }}
            options={projectOptions}
            value={selectedProjects}
            onChange={setSelectedProjects}
            placeholder="Choose projects to show in newsletter..."
            styles={customSelectStyles}
          />
        </div>
      </div>

      <div
        style={{
          border: '1px solid #ddd',
          height: '820px',
          marginBottom: '40px',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: '#fff',
          boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
        }}
      >
        <PDFViewer width="100%" height="100%">
          <NewsletterDocument
            jobs={filteredJobs}
            projects={filteredProjects}
            regionalPartners={regionalPartners}
            content={content}
          />
        </PDFViewer>
      </div>

      <div style={{ textAlign: 'center' }}>
        <PDFDownloadLink
          document={
            <NewsletterDocument
              jobs={filteredJobs}
              projects={filteredProjects}
              regionalPartners={regionalPartners}
              content={content}
            />
          }
          fileName={`BriskOlive_Newsletter_${formatNewsletterDate().replace(/ /g, '_')}.pdf`}
          style={{
            backgroundColor: '#4a7c2c',
            color: 'white',
            padding: '16px 60px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            display: 'inline-block',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {({ loading }) => (loading ? 'Generating PDF...' : 'Download Newsletter PDF')}
        </PDFDownloadLink>
      </div>
    </div>
  );
}