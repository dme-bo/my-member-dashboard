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
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 11, color: '#333', lineHeight: 1.4 },
  header: { marginBottom: 25, textAlign: 'center', borderBottom: '2 solid #4a7c2c', paddingBottom: 15 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#4a7c2c', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#555' },
  date: { fontSize: 10, color: '#666', marginTop: 5 },
  greeting: { marginBottom: 15, fontSize: 12 },
  section: { marginTop: 20, marginBottom: 15 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1a365d', marginBottom: 8, borderBottom: '1 solid #eee' },
  bodyText: { marginBottom: 10 },
  bold: { fontWeight: 'bold' },
  link: { color: '#0066cc', textDecoration: 'underline' },
  table: { display: 'table', width: 'auto', borderStyle: 'solid', borderWidth: 1, borderColor: '#ddd', marginBottom: 10 },
  tableRow: { flexDirection: 'row', borderBottom: '1 solid #ddd', paddingVertical: 6, paddingHorizontal: 4 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderBottom: '1.5 solid #ccc', paddingVertical: 8 },
  tableCell: { flex: 1, paddingHorizontal: 4, fontSize: 10 },
  image: { marginBottom: 3, width: '100%', height: 'auto' },
  footer: { marginTop: 40, paddingTop: 15, borderTop: '1 solid #ccc', fontSize: 9, textAlign: 'center', color: '#555' },
});

// ── Data Fetching ────────────────────────────────────────────────────
const fetchOpenJobs = async () => {
  const q = query(collection(db, 'jobsmaster'), where('job_status', '==', 'Open'));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const fetchOpenProjects = async () => {
  const q = query(collection(db, 'projectsmaster'), where('project_status', '==', 'Active'));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
  const docRef = doc(db, 'newsletter_config', 'weekly_config'); // ← adjust path if needed
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data();
  }
  console.warn('Newsletter content not found - using fallback values');
  return {}; // will use defaults in component
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
            <small style={{ color: '#666', marginLeft: '8px' }}>
              ({options.length})
            </small>
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
    flexWrap: 'nowrap',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  }),
  multiValue: (base) => ({ ...base, backgroundColor: '#e8f5e9', borderRadius: '4px', margin: '2px 4px 2px 0' }),
  multiValueLabel: (base) => ({ ...base, color: '#2c5e1f', fontSize: '0.9rem' }),
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
    companyName = "Brisk Olive Business Solutions Pvt Ltd",
    mainTitle = "Jobs & Earning Opportunities for Members",
    weeklySubtitle = "Weekly Update",
    greeting = "Dear All,\n\nThere are many exciting earning opportunities for you...",
    intro = {},
    jobsSection = {},
    tempStaffing = {},
    projectsSection = {},
    regionalPartners: rpSettings = {},
    defence = {},
    footer = {},
    images = {},
    quickLinks = [],
  } = content;

  const currentDate = formatNewsletterDate();

  return (
    <Document>
      <Page style={styles.page} wrap>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{mainTitle}</Text>
          <Text style={styles.subtitle}>{companyName}</Text>
          <Text style={styles.date}>{weeklySubtitle}: {currentDate}</Text>
        </View>

        {images.mainLogo && <Image style={styles.image} src={images.mainLogo} />}

        {/* Greeting */}
        <Text style={styles.greeting}>{greeting}</Text>

        {/* Introduction */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{intro.title || "A BRIEF INTRODUCTION TO BRISK OLIVE"}</Text>
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

          {/* 1. Jobs */}
          {jobs?.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { fontSize: 14 }]}>
                {jobsSection.title || "1. Get jobs across India"}
              </Text>
              <Text style={styles.bodyText}>
                {jobsSection.description || "You can get a job through us with companies like..."}
                {'\n\n'}
                {jobsSection.registrationText || "To get a job through us, please fill in your details in this form:"}{' '}
                <Link style={styles.link} src={jobsSection.registrationLink}>
                  {jobsSection.registrationLink}
                </Link>
              </Text>

              <Text style={[styles.bodyText, { marginTop: 10, fontWeight: 'bold' }]}>
                Open Jobs from Brisk Olive:
              </Text>

              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={styles.tableCell}>Company</Text>
                  <Text style={styles.tableCell}>Industry</Text>
                  <Text style={styles.tableCell}>Designation</Text>
                  <Text style={styles.tableCell}>Location</Text>
                  <Text style={styles.tableCell}>Basic</Text>
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
            </>
          )}

          <Text style={styles.bodyText}>
            Registration:{' '}
            <Link style={styles.link} src={jobsSection.alternativeRegLink || "#"}>
              Click here to register
            </Link>
          </Text>

          <Text style={styles.bodyText}>{jobsSection.successStoryText}</Text>
          {images.successStory1 && <Image style={styles.image} src={images.successStory1} />}
        </View>

        {/* 2. Temporary Staffing */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { fontSize: 14 }]}>
            {tempStaffing.title || "2. Temporary Staffing Assignments for You"}
          </Text>
          <Text style={styles.bodyText}>{tempStaffing.introText}</Text>

          {images.examInvigilator && <Image style={styles.image} src={images.examInvigilator} />}

          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableCell}>State</Text>
              <Text style={styles.tableCell}>Location</Text>
              <Text style={styles.tableCell}>Registration Link</Text>
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

        {/* 3. Projects */}
        {projects?.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { fontSize: 14 }]}>
              {projectsSection.title || "3. Work in our Projects / Surveys / Audits & Consultancies"}
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

            <Text style={styles.bodyText}>{projectsSection.otherProjectsTitle}</Text>
            <Text style={styles.bodyText}>{projectsSection.jewarText}</Text>
            {images.jewarAirport && <Image style={styles.image} src={images.jewarAirport} />}

            <Text style={styles.bodyText}>{projectsSection.solarText}</Text>
            {images.solarOandM && <Image style={styles.image} src={images.solarOandM} />}
          </View>
        )}

        {/* 4. Regional Partners */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{rpSettings.title || "4. Regional Partners"}</Text>
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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{defence?.title || "6. Defence Projects"}</Text>
          <Text style={styles.bodyText}>{defence?.text}</Text>
          {images.defenceProject && <Image style={styles.image} src={images.defenceProject} />}
        </View>

        {/* Quick Links */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About Brisk Olive - Your Partner in Growth</Text>
          {quickLinks.map((link, i) => (
            <Link key={i} style={styles.link} src={link.url}>
              {link.text}
            </Link>
          ))}
        </View>

        <Text style={{ marginTop: 20 }}>Thanks!{'\n\n'}(Team Brisk Olive)</Text>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>
            {companyName} | Privacy Policy | Terms of Use | Contact Us | Unsubscribe
          </Text>
          <Text>{footer?.address || "G-203 Sector 63 Noida Uttar Pradesh India"}</Text>
          <Text>Visit us at: {footer?.website || "https://briskolive.com"}</Text>
          <Text>{footer?.email || "info@briskolive.com"}</Text>
          <Text>{footer?.copyright || `© ${new Date().getFullYear()} Brisk Olive Business Solutions Pvt. Ltd.`}</Text>
        </View>
      </Page>
    </Document>
  );
};

// ── Main App Component ───────────────────────────────────────────────
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
        const [jobsData, projectsData, partnersData, contentData] = await Promise.all([
          fetchOpenJobs(),
          fetchOpenProjects(),
          fetchRegionalPartners(),
          fetchNewsletterContent(),
        ]);

        setJobs(jobsData);
        setProjects(projectsData);
        setRegionalPartners(partnersData);
        setContent(contentData);
      } catch (err) {
        console.error("Failed to load data:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const jobOptions = jobs.map(job => ({
    value: job.id,
    label: `${job.job_title || 'Position'} • ${job.job_company || '?'}`,
  }));

  const projectOptions = projects.map(proj => ({
    value: proj.id,
    label: proj.project_title || 'Project',
  }));

  const filteredJobs = jobs.filter(j => selectedJobs.some(s => s.value === j.id));
  const filteredProjects = projects.filter(p => selectedProjects.some(s => s.value === p.id));

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '120px 20px' }}>Loading newsletter data...</div>;
  }

  return (
    <div style={{
      fontFamily: 'Arial, Helvetica, sans-serif',
      padding: 'clamp(24px, 4vw, 48px) clamp(16px, 3vw, 32px)',
      maxWidth: '1800px',
      margin: '0 auto',
      width: '100%',
    }}>
      <h1 style={{
        color: '#4a7c2c',
        textAlign: 'center',
        marginBottom: '40px',
        fontSize: '3.7rem'
      }}>
        Brisk Olive Weekly Newsletter Generator
      </h1>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '40px',
        marginBottom: '50px'
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: '12px', fontWeight: 'bold', color: '#2c5e1f' }}>
            Select Jobs ({selectedJobs.length}/{jobOptions.length})
          </label>
          <Select
            isMulti
            closeMenuOnSelect={false}
            hideSelectedOptions={false}
            components={{ Option: CustomCheckboxOption, Menu: CustomMenu }}
            options={jobOptions}
            value={selectedJobs}
            onChange={setSelectedJobs}
            placeholder="Choose jobs to include..."
            styles={customSelectStyles}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '12px', fontWeight: 'bold', color: '#2c5e1f' }}>
            Select Projects ({selectedProjects.length}/{projectOptions.length})
          </label>
          <Select
            isMulti
            closeMenuOnSelect={false}
            hideSelectedOptions={false}
            components={{ Option: CustomCheckboxOption, Menu: CustomMenu }}
            options={projectOptions}
            value={selectedProjects}
            onChange={setSelectedProjects}
            placeholder="Choose projects to include..."
            styles={customSelectStyles}
          />
        </div>
      </div>

      <div style={{
        border: '1px solid #ddd',
        height: '820px',
        marginBottom: '40px',
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: '#fff',
        boxShadow: '0 2px 10px rgba(0,0,0,0.08)'
      }}>
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
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}
        >
          {({ loading }) => loading ? 'Generating PDF...' : 'Download PDF'}
        </PDFDownloadLink>
      </div>
    </div>
  );
}