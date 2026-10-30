import React, { useState, useEffect, useMemo, useRef } from 'react';
import Select, { components } from 'react-select';
import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  pdf,
  Link,
  Image,
  Font,
} from '@react-pdf/renderer';
import { collection, db, getDocs, query, where, doc, getDoc, updateDoc } from '../firestoreClient';
import OdooSearchBar from '../components/OdooSearchBar';
import OdooViewToolbar from '../components/OdooViewToolbar';
import FavoritesMenu from '../components/FavoritesMenu';
import TableLoadingSpinner from '../components/TableLoadingSpinner';
import { formatDateText } from "../utils/dateFormat";

// Default hyphenation breaks long words mid-syllable (e.g. "Unspeci-fied")
// inside narrow table cells — wrapping whole words looks far cleaner.
Font.registerHyphenationCallback((word) => [word]);

// ── PDF Styles ─────────────────────────────────────────────────────────────
// Centralized PDF styles keep the newsletter layout consistent across pages.
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
    alignItems: 'stretch',
    borderBottom: '1 solid #ddd',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#f0f0f0',
    borderBottom: '1.5 solid #ccc',
  },
  tableCell: { flex: 1, paddingHorizontal: 4, fontSize: 10, borderRight: '1 solid #ddd' },
  cellBox: { paddingHorizontal: 6, paddingVertical: 7, borderRight: '1 solid #ddd', justifyContent: 'flex-start' },
  cellBoxLast: { borderRight: 'none' },
  cellText: { fontSize: 10 },
  tableTop: { borderTop: '1 solid #ddd', borderLeft: '1 solid #ddd', borderRight: '1 solid #ddd' },
  tableSides: { borderLeft: '1 solid #ddd', borderRight: '1 solid #ddd' },
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
// Fetch helpers normalize remote assets and Firestore content before PDF generation.
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

// Same "Open, not a draft" rule as the Requirements page's Recruitment tab —
// without the isdraft check this pulled in every stale/never-published job.
// Projects run by TCS are shown under "Temporary Staffing" instead of
// "Projects" — same reclassification rule used on the Requirements page.
const TCS_TEMP_STAFFING_COMPANY = 'Tata Consultancy Services Pvt Ltd';

// Every "apply here" touchpoint also points members at the app itself.
const MEMBER_APP_LINK = 'https://play.google.com/store/apps/details?id=com.briskolive.memberapp';
const ApplyViaAppNote = () => (
  <Text style={[styles.bodyText, { marginTop: 6 }]}>
    Apply via our Brisk Olive Member App:{' '}
    <Link style={styles.link} src={MEMBER_APP_LINK}>{MEMBER_APP_LINK}</Link>
  </Text>
);

const fetchOpenJobs = async () => {
  const q = query(collection(db, 'jobsmaster'), where('job_status', '==', 'Open'), where('job_isdraft', '==', false));
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

const fetchOpenProjects = async () => {
  const q = query(collection(db, 'projectsmaster'), where('project_status', '==', 'Active'));
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

// `workshop_status` never actually holds "Scheduled" in real data (the real
// values are Active/Completed/Archived) — this filter never matched anything,
// which is why the newsletter always showed 0 workshops.
const fetchActiveWorkshops = async () => {
  const q = query(collection(db, 'workshopsmaster'), where('workshop_status', '==', 'Active'), where('workshop_isdraft', '==', false));
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

// Same Open/not-draft rule as the daily report's "No. of Community Jobs (Open)".
const fetchOpenCommunityJobs = async () => {
  const q = query(collection(db, 'communityjobs'), where('job_status', '==', 'Open'), where('job_isdraft', '==', false));
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

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Every date shown in the newsletter uses this same "dd MMM yyyy" format —
// zero-padded day, three-letter month — regardless of how it's stored
// (Firestore Timestamp, ISO string, or a plain Date).
const formatDDMMMYYYY = (value) => {
  const date =
    value && typeof value.toDate === 'function'
      ? value.toDate()
      : value instanceof Date
      ? value
      : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  return `${day} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
};

const formatNewsletterDate = () => formatDDMMMYYYY(new Date());

// ── Custom react-select components ─────────────────────────────────────────
// These custom react-select components add checkbox-style multi-select behavior.
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
  const options = (props.options || []).flatMap((o) => o.options || [o]);
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

// Compact underline-style selects for the "Include in newsletter" sidebar.
const sidebarSelectStyles = {
  ...customSelectStyles,
  control: (base, state) => ({
    ...base,
    minHeight: '30px',
    fontSize: '12px',
    border: 'none',
    borderBottom: `1px solid ${state.isFocused ? '#c2d45e' : '#dde1e7'}`,
    borderRadius: 0,
    boxShadow: 'none',
    background: 'transparent',
    ':hover': { borderBottomColor: '#94a3b8' },
  }),
  valueContainer: (base) => ({ ...base, padding: '0 2px', maxHeight: '96px', overflowY: 'auto' }),
  placeholder: (base) => ({ ...base, color: '#94a3b8', fontSize: '12px' }),
  indicatorSeparator: () => ({ display: 'none' }),
  dropdownIndicator: (base) => ({ ...base, padding: '4px', color: '#64748b' }),
  clearIndicator: (base) => ({ ...base, padding: '4px' }),
  multiValueLabel: (base) => ({ ...base, color: '#2c5e1f', fontSize: '11px' }),
  menuPortal: (base) => ({ ...base, zIndex: 3000 }),
  groupHeading: (base) => ({ ...base, fontSize: '11px', color: '#64748b', textTransform: 'none', fontWeight: 600 }),
};

const NEWSLETTER_SECTIONS = [
  { key: 'jobs', label: 'Jobs', placeholder: 'Select jobs to include...' },
  { key: 'projects', label: 'Projects', placeholder: 'Select projects to include...' },
  { key: 'workshops', label: 'Workshops', placeholder: 'Select workshops to include...' },
  { key: 'communityJobs', label: 'Community Jobs', placeholder: 'Select community jobs to include...' },
  { key: 'tempStaffing', label: 'Temp Staffing', placeholder: 'Select temp staffing assignments to include...' },
];
const NEWSLETTER_FAVORITES_KEY = 'newsletterFavorites';
// Preview zoom steps (percent); null = fit the whole page.
const ZOOM_STEPS = [50, 75, 100, 125, 150, 200];

// Headings keep this much room after them (heading + intro + table header + a row)
// so a heading is never stranded at the bottom of a page with its table on the next.
const HEADING_KEEP = 150;

// One table for every section: the header row always travels with the first data
// row, rows never split across pages, and each column gets its own width (a
// "Ser" column does not need the space a Description does).
// Helvetica has no rupee glyph (₹ prints as a superscript "1"), so spell it out.
const pdfSafe = (value) => (typeof value === 'string' ? value.replace(/₹\s*/g, 'Rs. ') : value);
const pdfSafeDeep = (value) => {
  if (typeof value === 'string') return pdfSafe(value);
  if (Array.isArray(value)) return value.map(pdfSafeDeep);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, pdfSafeDeep(v)]));
  }
  return value;
};

// Each cell is a View (not a bordered Text) so its dividers run the full row
// height instead of stopping at the end of the text. The header row never
// splits across pages.
const DataTable = ({ lead, columns, rows }) => {
  const cellBox = (column, c) => [
    styles.cellBox,
    { flex: column.flex || 1 },
    c === columns.length - 1 ? styles.cellBoxLast : null,
  ];
  return (
    <>
      {lead}
      <View style={[styles.tableHeader, styles.tableTop]} wrap={false} minPresenceAhead={70}>
        {columns.map((column, c) => (
          <View key={column.label} style={cellBox(column, c)}>
            <Text style={[styles.cellText, { fontWeight: "bold" }]}>{column.label}</Text>
          </View>
        ))}
      </View>
      {rows.map((cells, i) => (
        <View key={i} style={[styles.tableRow, styles.tableSides]} wrap={false}>
          {cells.map((cell, c) => (
            <View key={c} style={cellBox(columns[c], c)}>
              <Text style={styles.cellText}>{pdfSafe(cell)}</Text>
            </View>
          ))}
        </View>
      ))}
      <View style={{ height: 12 }} />
    </>
  );
};

const applyLink = <Link src={MEMBER_APP_LINK}>{'Apply'}</Link>;

// ── PDF Document Component (full structure) ────────────────────────────────
// The document component assembles jobs, projects, partner stats, and config content.
const NewsletterDocument = ({ jobs, projects, workshops, communityJobs, tempStaffingProjects, regionalPartners, content: rawContent }) => {
  const content = pdfSafeDeep(rawContent);
  const {
    companyName = 'Brisk Olive Business Solutions Pvt Ltd',
    mainTitle = 'Jobs & Earning Opportunities for Members',
    weeklySubtitle = 'Weekly Update',
    greeting = '',
    intro = {},
    jobsSection = {},
    communityJobsSection = {},
    tempStaffing = {},
    projectsSection = {},
    workshopsSection = {},
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
        <View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle} minPresenceAhead={HEADING_KEEP}>{intro.title || 'A BRIEF INTRODUCTION TO BRISK OLIVE'}</Text>
            <Text style={styles.bodyText}>{intro.text}</Text>
            {images.servicesSummary && <Image style={styles.image} src={images.servicesSummary} />}
            <Text style={styles.bodyText}>{intro.clientsIntro}</Text>
            {images.clientLogos && <Image style={styles.image} src={images.clientLogos} />}
          </View>
        </View>

        {/* Opportunities Summary */}
        <>
          <Text style={[styles.sectionTitle, { marginTop: 20 }]} minPresenceAhead={HEADING_KEEP}>
            A SUMMARY OF EARNING & OTHER OPPORTUNITIES FOR BRISK OLIVE MEMBERS - {currentDate}
          </Text>

          {/* Jobs */}
          {jobs?.length > 0 && (
            <>
              <DataTable
                lead={
                  <>
                    <Text style={styles.subsectionTitle} minPresenceAhead={HEADING_KEEP}>{jobsSection.title || '1. Get jobs across India'}</Text>
                    <Text style={styles.bodyText} minPresenceAhead={90}>{jobsSection.description}</Text>
                    <Text style={[styles.bodyText, { marginTop: 8, fontWeight: 'bold' }]}>
                      {jobsSection.registrationText || 'Open Jobs from Brisk Olive:'}
                    </Text>
                  </>
                }
                columns={[
                  { label: 'Company', flex: 1.3 },
                  { label: 'Industry', flex: 1 },
                  { label: 'Designation', flex: 1.3 },
                  { label: 'Location', flex: 1 },
                  { label: 'Salary', flex: 0.8 },
                ]}
                rows={jobs.map((job) => [
                  job.job_showcompanynameinposts === false ? 'Company Unspecified' : (job.job_company || '-'),
                  job.job_industry || '-',
                  job.job_title || '-',
                  job.job_location || '-',
                  job.job_salaryrange_maximum || '-',
                ])}
              />
              <Text style={styles.bodyText}>
                To apply / register:{' '}
                <Link style={styles.link} src={jobsSection.registrationLink}>
                  {jobsSection.registrationLink}
                </Link>
              </Text>
              <ApplyViaAppNote />
              {jobsSection.successStoryText && (
                <View>
                  <Text style={[styles.bodyText, { marginTop: 10 }]}>{jobsSection.successStoryText}</Text>
                  {images.successStory && <Image style={styles.image} src={images.successStory} />}
                  {images.successStory1 && <Image style={styles.image} src={images.successStory1} />}
                </View>
              )}
            </>
          )}

          {/* Community Jobs */}
          {communityJobs?.length > 0 && (
            <>
              <DataTable
                lead={
                  <>
                    <Text style={styles.subsectionTitle} minPresenceAhead={HEADING_KEEP}>{communityJobsSection.title || 'Community Job Postings'}</Text>
                    <Text style={styles.bodyText} minPresenceAhead={90}>{communityJobsSection.description}</Text>
                  </>
                }
                columns={[
                  { label: 'Company', flex: 1.2 },
                  { label: 'Designation', flex: 1.3 },
                  { label: 'Location', flex: 1 },
                  { label: 'Experience', flex: 0.9 },
                  { label: 'Salary', flex: 1 },
                ]}
                rows={communityJobs.map((job) => [
                  job.job_company || '-',
                  job.job_designation || '-',
                  job.job_location || '-',
                  job.job_experience_required || '-',
                  job.job_salary_minimum || job.job_salary_maximum
                    ? `₹${job.job_salary_minimum || 0} - ₹${job.job_salary_maximum || 0}`
                    : '-',
                ])}
              />
              <ApplyViaAppNote />
            </>
          )}

          {/* Temporary Staffing — projectsmaster entries where project_company is
              TCS are shown here instead of under Projects (no company column,
              since every row here is the same company by definition). */}
          <>
            {(() => {
              const lead = (
                <>
                  <Text style={styles.subsectionTitle} minPresenceAhead={HEADING_KEEP}>{tempStaffing.title || '2. Temporary Staffing Assignments for You'}</Text>
                  <Text style={styles.bodyText} minPresenceAhead={90}>{tempStaffing.introText}</Text>
                  {images.examInvigilator && <Image style={styles.image} src={images.examInvigilator} />}
                </>
              );
              return tempStaffingProjects?.length > 0 ? null : lead;
            })()}
            {tempStaffingProjects?.length > 0 && (
              <DataTable
                lead={
                  <>
                    <Text style={styles.subsectionTitle} minPresenceAhead={HEADING_KEEP}>{tempStaffing.title || '2. Temporary Staffing Assignments for You'}</Text>
                    <Text style={styles.bodyText} minPresenceAhead={90}>{tempStaffing.introText}</Text>
                    {images.examInvigilator && <Image style={styles.image} src={images.examInvigilator} />}
                  </>
                }
                columns={[
                  { label: 'Ser', flex: 0.35 },
                  { label: 'Assignment', flex: 1.4 },
                  { label: 'Description', flex: 2.6 },
                  { label: 'Apply', flex: 0.6 },
                ]}
                rows={tempStaffingProjects.map((proj, i) => [
                  `${String(i + 1).padStart(2, '0')}.`,
                  proj.project_title || '-',
                  proj.project_description || '-',
                  applyLink,
                ])}
              />
            )}
          </>

          {/* Projects */}
          {projects?.length > 0 && (
            <>
              <DataTable
                lead={
                  <>
                    <Text style={styles.subsectionTitle} minPresenceAhead={HEADING_KEEP}>
                      {projectsSection.title || '3. Work in our Projects / Surveys / Audits & Consultancies'}
                    </Text>
                    <Text style={styles.bodyText} minPresenceAhead={90}>{projectsSection.intro}</Text>
                  </>
                }
                columns={[
                  { label: 'Ser', flex: 0.35 },
                  { label: 'Project', flex: 1.4 },
                  { label: 'Description', flex: 2.6 },
                  { label: 'Apply', flex: 0.6 },
                ]}
                rows={projects.map((proj, i) => [
                  `${String(i + 1).padStart(2, '0')}.`,
                  proj.project_title || '-',
                  proj.project_description || '-',
                  applyLink,
                ])}
              />
              <Text style={[styles.bodyText, { marginTop: 10 }]}>{projectsSection.otherProjectsTitle}</Text>
              <Text style={styles.bodyText}>{projectsSection.jewarText}</Text>
              {images.jewarAirport && <Image style={styles.image} src={images.jewarAirport} />}
              <Text style={styles.bodyText}>{projectsSection.solarText}</Text>
              {images.solarOandM && <Image style={styles.image} src={images.solarOandM} />}
            </>
          )}

          {/* Regional Partners */}
          <>
            <Text style={styles.subsectionTitle} minPresenceAhead={HEADING_KEEP}>{rpSettings.title || '4. Regional Partners'}</Text>
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
          </>

          {/* Defence Projects */}
          <View>
            <Text style={styles.subsectionTitle} minPresenceAhead={260}>{defence.title || '5. Defence Projects'}</Text>
            <Text style={styles.bodyText}>{defence.text}</Text>
            {images.defenceProject && <Image style={styles.image} src={images.defenceProject} />}
          </View>

          {/* Workshops */}
          {workshops?.length > 0 && (
            <>
              <DataTable
                lead={
                  <>
                    <Text style={styles.subsectionTitle} minPresenceAhead={HEADING_KEEP}>{workshopsSection.title || '6. Upcoming Workshops'}</Text>
                    <Text style={styles.bodyText} minPresenceAhead={90}>{workshopsSection.intro}</Text>
                  </>
                }
                columns={[
                  { label: 'Workshop', flex: 2 },
                  { label: 'Organizer', flex: 1.2 },
                  { label: 'Location', flex: 1.4 },
                  { label: 'Date', flex: 0.9 },
                  { label: 'Fee', flex: 0.6 },
                ]}
                rows={workshops.map((workshop) => [
                  workshop.workshop_title || '-',
                  workshop.workshop_organizer || '-',
                  workshop.workshop_location || '-',
                  formatDDMMMYYYY(workshop.workshop_start_date) || '-',
                  workshop.workshop_fee || workshop.workshop_fee === 0 ? `₹${workshop.workshop_fee}` : '-',
                ])}
              />
              {workshopsSection.registrationLink && (
                <Text style={styles.bodyText}>
                  To register:{' '}
                  <Link style={styles.link} src={workshopsSection.registrationLink}>
                    {workshopsSection.registrationLink}
                  </Link>
                </Text>
              )}
              <ApplyViaAppNote />
            </>
          )}

          {/* About Us */}
          <View>
            <View style={{ marginTop: 25, marginBottom: 20 }}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle} minPresenceAhead={140}>
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
        </>
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
  const [workshops, setWorkshops] = useState([]);
  const [communityJobs, setCommunityJobs] = useState([]);
  const [tempStaffingProjects, setTempStaffingProjects] = useState([]);
  const [regionalPartners, setRegionalPartners] = useState([]);
  const [content, setContent] = useState({});
  const [editedContent, setEditedContent] = useState({});
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [selectedWorkshops, setSelectedWorkshops] = useState([]);
  const [selectedCommunityJobs, setSelectedCommunityJobs] = useState([]);
  const [selectedTempStaffingProjects, setSelectedTempStaffingProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const scrollContainerRef = useRef(null);
  const scrollPosition = useRef(0);

  // Header band: search / Filters (sections shown) / Group By / Favorites.
  const [searchTerm, setSearchTerm] = useState('');
  const [hiddenSections, setHiddenSections] = useState(() => new Set());
  const [groupBy, setGroupBy] = useState(null); // null | 'company'
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem(NEWSLETTER_FAVORITES_KEY)) || []; } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(NEWSLETTER_FAVORITES_KEY, JSON.stringify(favorites)); } catch { /* storage unavailable */ }
  }, [favorites]);

  // Generated PDF (blob URL + page count) and the preview's page / zoom.
  const [pdfFile, setPdfFile] = useState({ url: null, pages: 0 });
  const [generating, setGenerating] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(null); // index into ZOOM_STEPS, null = fit

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [jobsData, projectsData, workshopsData, communityJobsData, partnersData, contentData] = await Promise.all([
          fetchOpenJobs(),
          fetchOpenProjects(),
          fetchActiveWorkshops(),
          fetchOpenCommunityJobs(),
          fetchRegionalPartners(),
          fetchNewsletterContent(),
        ]);

        const processedImages = {};
        if (contentData?.images) {
          // Fetch all configured images concurrently instead of one at a time —
          // a sequential await-in-a-loop made initial load take N x (image fetch
          // time) instead of the time of the single slowest image.
          const entries = Object.entries(contentData.images);
          const results = await Promise.all(entries.map(([, url]) => getBase64FromUrl(url)));
          entries.forEach(([key], index) => {
            if (results[index]) processedImages[key] = results[index];
          });
        }

        const regularProjects = projectsData.filter((p) => p.project_company !== TCS_TEMP_STAFFING_COMPANY);
        const tcsProjects = projectsData.filter((p) => p.project_company === TCS_TEMP_STAFFING_COMPANY);

        const fullContent = { ...contentData, images: processedImages };
        setJobs(jobsData);
        setProjects(regularProjects);
        setTempStaffingProjects(tcsProjects);
        setWorkshops(workshopsData);
        setCommunityJobs(communityJobsData);
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
      const changedImageEntries = Object.entries(changes.images || {});
      const changedImageResults = await Promise.all(
        changedImageEntries.map(([, url]) => getBase64FromUrl(url))
      );
      changedImageEntries.forEach(([key], index) => {
        if (changedImageResults[index]) newImages[key] = changedImageResults[index];
      });

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
    company: j.job_company,
  }));

  const projectOptions = projects.map((p) => ({
    value: p.id,
    label: `${p.project_company || '?'} • ${p.project_title || 'Project'}`,
    company: p.project_company,
  }));

  const workshopOptions = workshops.map((w) => ({
    value: w.id,
    label: `${w.workshop_title || 'Workshop'}${w.workshop_start_date ? ' • ' + formatDateText(w.workshop_start_date) : ''}`,
  }));

  const communityJobOptions = communityJobs.map((j) => ({
    value: j.id,
    label: `${j.job_company || '?'} • ${j.job_designation || 'Position'}`,
    company: j.job_company,
  }));

  const tempStaffingProjectOptions = tempStaffingProjects.map((p) => ({
    value: p.id,
    label: p.project_title || 'Assignment',
    company: p.project_company,
  }));

  // PDFViewer/PDFDownloadLink regenerate the entire PDF whenever the `document`
  // element's props change reference — without memoizing these, every render
  // (e.g. the toast auto-dismiss timer, any unrelated state update) produced a
  // brand-new filtered array, so the preview kept rebuilding itself every couple
  // of seconds.
  const filteredJobs = useMemo(
    () => jobs.filter((j) => selectedJobs.some((s) => s.value === j.id)),
    [jobs, selectedJobs]
  );
  const filteredProjects = useMemo(
    () => projects.filter((p) => selectedProjects.some((s) => s.value === p.id)),
    [projects, selectedProjects]
  );
  const filteredWorkshops = useMemo(
    () => workshops.filter((w) => selectedWorkshops.some((s) => s.value === w.id)),
    [workshops, selectedWorkshops]
  );
  const filteredCommunityJobs = useMemo(
    () => communityJobs.filter((j) => selectedCommunityJobs.some((s) => s.value === j.id)),
    [communityJobs, selectedCommunityJobs]
  );
  const filteredTempStaffingProjects = useMemo(
    () => tempStaffingProjects.filter((p) => selectedTempStaffingProjects.some((s) => s.value === p.id)),
    [tempStaffingProjects, selectedTempStaffingProjects]
  );

  const newsletterDocumentElement = useMemo(
    () => (
      <NewsletterDocument
        jobs={filteredJobs}
        projects={filteredProjects}
        workshops={filteredWorkshops}
        communityJobs={filteredCommunityJobs}
        tempStaffingProjects={filteredTempStaffingProjects}
        regionalPartners={regionalPartners}
        content={content}
      />
    ),
    [filteredJobs, filteredProjects, filteredWorkshops, filteredCommunityJobs, filteredTempStaffingProjects, regionalPartners, content]
  );

  // Each sidebar section: its full option list, selection and setter.
  const sections = {
    jobs: { options: jobOptions, value: selectedJobs, set: setSelectedJobs },
    projects: { options: projectOptions, value: selectedProjects, set: setSelectedProjects },
    workshops: { options: workshopOptions, value: selectedWorkshops, set: setSelectedWorkshops },
    communityJobs: { options: communityJobOptions, value: selectedCommunityJobs, set: setSelectedCommunityJobs },
    tempStaffing: { options: tempStaffingProjectOptions, value: selectedTempStaffingProjects, set: setSelectedTempStaffingProjects },
  };

  // Search narrows each dropdown's options; Group By → Company groups them.
  const visibleOptions = (options) => {
    const term = searchTerm.trim().toLowerCase();
    const matched = term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;
    if (groupBy !== 'company') return matched;
    const groups = new Map();
    matched.forEach((o) => {
      const key = o.company || 'No company';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    });
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, opts]) => ({ label, options: opts }));
  };

  const toggleSection = (key) =>
    setHiddenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  // Filters menu ticks the sections that are shown; none hidden = all ticked.
  const quickFilters = NEWSLETTER_SECTIONS.map((sec) => ({
    key: sec.key,
    label: sec.label,
    active: hiddenSections.size > 0 && !hiddenSections.has(sec.key),
    onToggle: () => {
      if (hiddenSections.size === 0) {
        // First click: show only this section.
        setHiddenSections(new Set(NEWSLETTER_SECTIONS.filter((x) => x.key !== sec.key).map((x) => x.key)));
      } else {
        toggleSection(sec.key);
      }
    },
  }));
  const filterChips = [
    ...(hiddenSections.size ? [{ key: 'sections', label: `Showing: ${NEWSLETTER_SECTIONS.filter((x) => !hiddenSections.has(x.key)).map((x) => x.label).join(', ') || 'none'}`, onRemove: () => setHiddenSections(new Set()) }] : []),
    ...(groupBy ? [{ key: 'group', label: 'Group: Company', onRemove: () => setGroupBy(null) }] : []),
  ];

  const resetSelection = () => {
    NEWSLETTER_SECTIONS.forEach((sec) => sections[sec.key].set([]));
    setSearchTerm('');
    setHiddenSections(new Set());
    setGroupBy(null);
    setPreviewPage(1);
  };
  const saveCurrentAsFavorite = (name) =>
    setFavorites((prev) => [
      ...prev,
      { id: `${Date.now()}`, name, selection: Object.fromEntries(NEWSLETTER_SECTIONS.map((sec) => [sec.key, sections[sec.key].value.map((o) => o.value)])) },
    ]);
  const applyFavorite = (fav) => {
    NEWSLETTER_SECTIONS.forEach((sec) => {
      const ids = new Set(fav.selection?.[sec.key] || []);
      sections[sec.key].set(sections[sec.key].options.filter((o) => ids.has(o.value)));
    });
    setPreviewPage(1);
  };
  const deleteFavorite = (id) => setFavorites((prev) => prev.filter((fav) => fav.id !== id));

  // Build the PDF once per change (debounced) and show it in a plain iframe,
  // so the header can drive page navigation and zoom via the URL fragment.
  useEffect(() => {
    if (loading) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setGenerating(true);
      try {
        const blob = await pdf(newsletterDocumentElement).toBlob();
        const raw = await blob.text();
        const pages = (raw.match(/\/Type\s*\/Page(?![s\w])/g) || []).length || 1;
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setPdfFile((prev) => {
          if (prev.url) URL.revokeObjectURL(prev.url);
          return { url, pages };
        });
        setPreviewPage((p) => Math.min(p, pages));
      } catch (err) {
        console.error('PDF generation failed:', err);
      } finally {
        if (!cancelled) setGenerating(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [newsletterDocumentElement, loading]);

  const pdfUrlRef = useRef(null);
  pdfUrlRef.current = pdfFile.url;
  useEffect(() => () => { if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current); }, []);

  const zoomFragment = zoomIndex === null ? 'view=Fit' : `zoom=${ZOOM_STEPS[zoomIndex]}`;
  const previewSrc = pdfFile.url ? `${pdfFile.url}#toolbar=0&navpanes=0&page=${previewPage}&${zoomFragment}` : null;
  const zoomOut = () => setZoomIndex((z) => (z === null ? 1 : Math.max(0, z - 1)));
  const zoomIn = () => setZoomIndex((z) => (z === null ? 2 : Math.min(ZOOM_STEPS.length - 1, z + 1)));
  const pdfFileName = `Newsletter_${formatNewsletterDate().replace(/ /g, '_')}.pdf`;

  return (
    <div className="newsletter-app page-fill">

      <div className="nl-header page-header-band">
        <div className="nl-title-row">
          <div className="nl-title">
            <h1>Newsletter</h1>
            <span>Choose what to include, then preview the PDF</span>
          </div>
          <button type="button" className="nl-outline-btn" onClick={resetSelection}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
            Reset Selection
          </button>
        </div>

        <div className="nl-controls-row">
          <OdooSearchBar
            variant="boxed"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search jobs, projects, workshops to include..."
            chips={filterChips}
          />
          <div className="member-toolbar-group">
            <OdooViewToolbar
              variant="boxed"
              quickFilters={quickFilters}
              groupByOptions={[{ key: 'company', label: 'Company' }]}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
              showViewToggle={false}
            />
            <FavoritesMenu favorites={favorites} onApply={applyFavorite} onDelete={deleteFavorite} onSave={saveCurrentAsFavorite} />
          </div>
        </div>

        <div className="nl-meta-row">
          <div className="nl-meta-left">
            <button
              type="button"
              className="nl-primary-btn"
              disabled={loading}
              onClick={() => {
                setEditedContent(structuredClone(content || {}));
                setShowEditModal(true);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
              Edit Content
            </button>
            <a
              className={`nl-outline-btn${!pdfFile.url || generating ? ' is-disabled' : ''}`}
              href={pdfFile.url || undefined}
              download={pdfFileName}
              aria-disabled={!pdfFile.url || generating}
              onClick={(e) => { if (!pdfFile.url || generating) e.preventDefault(); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11" /><path d="M7 11l5 5 5-5" /><path d="M5 20h14" /></svg>
              {generating ? 'Generating…' : 'Download PDF'}
            </a>
          </div>
          <div className="nl-meta-right">
            <span className="nl-range">Page {pdfFile.pages ? previewPage : 0} / {pdfFile.pages}</span>
            <button type="button" className="nl-icon-btn" aria-label="Previous page" disabled={previewPage <= 1} onClick={() => setPreviewPage((p) => p - 1)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button type="button" className="nl-icon-btn" aria-label="Next page" disabled={previewPage >= pdfFile.pages} onClick={() => setPreviewPage((p) => p + 1)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
            <div className="nl-zoom" role="group" aria-label="Zoom">
              <button type="button" aria-label="Zoom out" title={zoomIndex === null ? 'Fit page' : `${ZOOM_STEPS[zoomIndex]}%`} disabled={zoomIndex === 0} onClick={zoomOut}>−</button>
              <button type="button" aria-label="Zoom in" title={zoomIndex === null ? 'Fit page' : `${ZOOM_STEPS[zoomIndex]}%`} disabled={zoomIndex === ZOOM_STEPS.length - 1} onClick={zoomIn}>+</button>
            </div>
          </div>
        </div>
      </div>

      <div className="nl-body page-fill-mid">
        {loading ? (
          <TableLoadingSpinner label="Loading newsletter…" />
        ) : (
          <div className="nl-split">
            <aside className="nl-sidebar" aria-label="Include in newsletter">
              <h2>Include in newsletter</h2>
              {NEWSLETTER_SECTIONS.filter((sec) => !hiddenSections.has(sec.key)).map((sec) => {
                const section = sections[sec.key];
                return (
                  <div className="nl-field" key={sec.key}>
                    <label>
                      {sec.label} <span>({section.value.length}/{section.options.length})</span>
                    </label>
                    <Select
                      isMulti
                      aria-label={sec.label}
                      closeMenuOnSelect={false}
                      components={{ Option: CustomCheckboxOption, Menu: CustomMenu }}
                      options={visibleOptions(section.options)}
                      value={section.value}
                      onChange={(v) => { section.set(v || []); setPreviewPage(1); }}
                      placeholder={sec.placeholder}
                      styles={sidebarSelectStyles}
                      menuPortalTarget={document.body}
                      menuPosition="fixed"
                    />
                  </div>
                );
              })}
            </aside>

            <section className="nl-preview" aria-label="Newsletter preview">
              {previewSrc ? (
                <iframe
                  key={previewSrc}
                  className={`nl-paper${zoomIndex === null ? '' : ' is-zoomed'}`}
                  title={`Newsletter preview, page ${previewPage} of ${pdfFile.pages}`}
                  src={previewSrc}
                />
              ) : (
                <TableLoadingSpinner label="Building preview…" />
              )}
              {generating && previewSrc && <div className="nl-preview-busy">Updating preview…</div>}
            </section>
          </div>
        )}
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
            <h3 style={{ marginTop: 0, color: '#5f6f14' }}>Save Changes?</h3>
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
          width: 100%;
          max-width: 100%;
          margin: 0;
          box-sizing: border-box;
          background: #fff;
        }
        .nl-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .nl-title { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
        .nl-title h1 { margin: 0; }
        .nl-title span { font-size: 14px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .nl-controls-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .member-toolbar-group { border: 1px solid #dde1e7; border-left: none; border-radius: 6px; background: #fff; display: flex; align-items: stretch; margin-left: auto; }
        .member-toolbar-group > div:first-child { gap: 0 !important; }
        .member-toolbar-group button { border: none !important; border-left: 1px solid #dde1e7 !important; border-radius: 0 !important; height: 32px !important; }
        .member-toolbar-group > div:first-child > div:first-child button { border-radius: 6px 0 0 6px !important; }
        .member-toolbar-group > div:last-child button { border-radius: 0 6px 6px 0 !important; }
        .nl-meta-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .nl-meta-left, .nl-meta-right { display: flex; align-items: center; gap: 8px; }
        .nl-meta-right { gap: 6px; }
        .nl-outline-btn, .nl-primary-btn { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 11px; border-radius: 6px; font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap; text-decoration: none; box-sizing: border-box; }
        .nl-outline-btn { border: 1px solid #dde1e7; background: #fff; color: #334155; }
        .nl-outline-btn:hover { background: #f8fafc; }
        .nl-outline-btn.is-disabled { color: #94a3b8; cursor: not-allowed; }
        .nl-primary-btn { border: 1px solid #c2d45e; background: #c2d45e; color: #243014; font-weight: 600; }
        .nl-primary-btn:hover { background: #aabd3f; }
        .nl-primary-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .nl-range { font-size: 13px; font-weight: 600; color: #111827; white-space: nowrap; margin-right: 2px; }
        .nl-icon-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; border: 1px solid #dde1e7; border-radius: 6px; background: #fff; color: #475569; cursor: pointer; }
        .nl-icon-btn:disabled { background: #f8fafc; color: #cbd5e1; cursor: not-allowed; }
        .nl-zoom { display: flex; margin-left: 6px; border: 1px solid #dde1e7; border-radius: 6px; overflow: hidden; }
        .nl-zoom button { width: 30px; height: 28px; padding: 0; border: none; background: #fff; color: #334155; font-size: 16px; line-height: 1; cursor: pointer; }
        .nl-zoom button + button { border-left: 1px solid #dde1e7; }
        .nl-zoom button:disabled { color: #cbd5e1; cursor: not-allowed; }
        .nl-body { border-top: 1px solid #dde1e7; }
        .nl-split { flex: 1 1 auto; min-height: 0; display: flex; }
        .nl-sidebar { flex: 0 0 240px; box-sizing: border-box; padding: 18px 16px; border-right: 1px solid #dde1e7; background: #fff; overflow-y: auto; }
        .nl-sidebar h2 { margin: 0 0 14px; font-size: 13px; font-weight: 600; color: #111827; }
        .nl-field + .nl-field { margin-top: 14px; }
        .nl-field label { display: block; margin-bottom: 2px; font-size: 12px; font-weight: 600; color: #1d2127; }
        .nl-field label span { font-weight: 400; color: #64748b; }
        .nl-preview { position: relative; flex: 1 1 auto; min-width: 0; display: flex; align-items: stretch; justify-content: center; padding: 16px 24px; background: #e9ebe6; overflow: hidden; }
        .nl-paper { height: 100%; aspect-ratio: 210 / 297; max-width: 100%; border: none; background: #fff; box-shadow: 0 2px 10px rgba(15, 23, 42, 0.12); }
        .nl-paper.is-zoomed { aspect-ratio: auto; width: 100%; }
        .nl-preview-busy { position: absolute; top: 12px; right: 16px; padding: 4px 10px; border-radius: 999px; background: rgba(255, 255, 255, 0.9); color: #475569; font-size: 12px; }
        @media (max-width: 767px) {
          .nl-split { flex-direction: column; }
          .nl-sidebar { flex: none; border-right: none; border-bottom: 1px solid #dde1e7; max-height: 45%; }
          .nl-title span { display: none; }
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
          background: #c2d45e;
          color: #243014;
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
