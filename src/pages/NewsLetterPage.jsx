import React, { useState, useEffect } from 'react';
import { Page, Text, View, Document, StyleSheet, PDFDownloadLink, PDFViewer, Link, Image } from '@react-pdf/renderer';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase'; // Assume your Firebase config is set up

// Styles for attractive PDF
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
  tableColSpan: { flex: 7, textAlign: 'center', fontWeight: 'bold' },
  image: { marginBottom: 3, width: '100%', height: 'auto' },
  smallImage: { width: 100, height: 50, margin: 5 },
  listItem: { marginBottom: 5 },
  footer: { marginTop: 40, paddingTop: 15, borderTop: '1 solid #ccc', fontSize: 9, textAlign: 'center', color: '#555' },
});

// Fetch data from Firebase
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

// Newsletter Document Component (dynamic)
const NewsletterDocument = ({ jobs, projects, regionalPartners }) => (
  <Document>
    <Page style={styles.page} wrap>
      {/* Header */}
      <View style={styles.header}>
        {/* <Image style={{ width: 100, marginBottom: 10 }} src="https://www.mepsc.in/wp-content/uploads/2025/08/Brisk-Olive_Transparent-logo_1.jpg" /> */}
        <Text style={styles.title}>Jobs & Earning Opportunities for Members</Text>
        <Text style={styles.subtitle}>Brisk Olive Business Solutions Pvt Ltd</Text>
        <Text style={styles.date}>Weekly Update: 12 Jan 2026</Text>
      </View>

      {/* <Image style={styles.image} src="bo 2.png" /> */}
                <Image
                    style={styles.image}
                    src="src/images/logo 1.png"
                />

      {/* Greeting */}
      <Text style={styles.greeting}>
        Dear All,{'\n\n'}
        There are many exciting earning opportunities for you. Our industry partners are offering us job vacancies, temporary staffing assignments, part-time surveys/audits/consultancies, as well as projects, all to be undertaken by our ex-soldiers and other members. There are also internship and apprenticeship opportunities for your children abroad!{'\n\n'}
        If you have any questions or need support or advice, please do not hesitate to contact us at members.manager@briskolive.com. Our team is ready to serve, and we look forward to working with you.{'\n\n'}
        We wish you and your families all the best in the year ahead.{'\n\n'}
        Sincerely,{'\n'}
        Col Sunil Prem{'\n'}
        MD & CEO, Brisk Olive Business Solutions Pvt. Ltd.
      </Text>

      {/* Company Introduction */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>A BRIEF INTRODUCTION TO BRISK OLIVE</Text>
        <Text style={styles.bodyText}>
          Brisk Olive is a company founded by an ex-soldier that offers a wide array of services to its clients, ranging from Job Placements, Temporary Staffing, Surveys, Audits, Data Logging, Market Research, operations and maintenance, project execution, social impact assignments, Sourcing, and Training. We are well-equipped to handle scale assignments through our ex-soldiers field force. Here is a summary of our services:{'\n'}
        </Text>
        <Image
                    style={styles.image}
                    src="src/images/logo 2.png"
                />
        <Text style={styles.bodyText}>
          Our Clients: Numerous companies, who are business leaders in their domains, avail our services. Here are a few sample customers.
        </Text>
        <Image
                    style={styles.image}
                    src="src/images/logo 3.png"
                />
        <Text style={styles.bodyText}>
        </Text>
      </View>

      {/* Opportunities Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>A SUMMARY OF EARNING & OTHER OPPORTUNITIES FOR BRISK OLIVE MEMBERS - 12 Jan 2026</Text>

        {/* 1. Jobs - Dynamic */}
        <Text style={[styles.sectionTitle, { fontSize: 14 }]}>1. Get jobs across India</Text>
        <Text style={styles.bodyText}>
          You can get a job through us with companies like Accenture, Amazon, Bharti, Bajaj Electricals, Flipkart, Pharmeasy, etc. A list of open vacancies is given below. To get a job through us, please fill in your details in this form: <Link style={styles.link} src="https://forms.gle/UrAKH1y98j3q7QmT6">https://forms.gle/UrAKH1y98j3q7QmT6</Link>. If your profile fits any of the existing vacancies, we will get back to you. We will also contact you for future opportunities.
        </Text>
        <Text style={[styles.bodyText, { marginTop: 10, fontWeight: 'bold' }]}>Open Jobs from Brisk Olive:</Text>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableCell}>Industry</Text>
            <Text style={styles.tableCell}>Designation</Text>
            <Text style={styles.tableCell}>Location</Text>
            <Text style={styles.tableCell}>Skills</Text>
            <Text style={styles.tableCell}>Nos</Text>
            <Text style={styles.tableCell}>Job Description</Text>
            <Text style={styles.tableCell}>Basic</Text>
          </View>
          {/* Dynamic jobs - example mapping, adjust fields */}
          {jobs.map((job, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.tableCell}>{job.job_industry || 'E Commerce'}</Text>
              <Text style={styles.tableCell}>{job.job_title || 'Senior Operations Manager'}</Text>
              <Text style={styles.tableCell}>{job.job_location || 'Bangalore'}</Text>
              <Text style={styles.tableCell}>{job.job_skills || 'Operation'}</Text>
              <Text style={styles.tableCell}>{job.job_nos || '01'}</Text>
              <Text style={styles.tableCell}>
                <Link src={job.job_description_link || 'https://drive.google.com/...'}>Link</Link>
              </Text>
              <Text style={styles.tableCell}>{job.job_basic || '21 LPA + 15% variable'}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.bodyText}>Please fill out the form</Text>
        <Text style={styles.bodyText}>
          Click this link for Registration in Brisk Olive: <Link style={styles.link} src="https://script.google.com/a/briskolive.com/macros/s/AKfycbyrNSun6HSF2nXnET46zTt1g1VNBjBflykFk59hjUHhlnC_R6RbqhyPf_8gTpIJimZF/exec?v=newMember">Link</Link>
        </Text>
        <Text style={styles.bodyText}>Here's a recent success story - of a veteran placed through Brisk Olive:</Text>

        <Image
                    style={styles.image}
                    src="src/images/logo 4.png"
                />

                <Image
                    style={styles.image}
                    src="src/images/logo 5.png"
                />
        <Image style={styles.image} src="https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=749036470601358" />
      </View>

      {/* 2. Temp Staffing */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { fontSize: 14 }]}>2. Temporary Staffing Assignments for You</Text>
        <Text style={styles.bodyText}>
          You can work as Exam Invigilators (Temporary Staff) through us, for companies like TCS and Aptech{'\n\n'}</Text>
          <Image
                    style={styles.image}
                    src="src/images/logo 6.png"
                />
         <Text>Hundreds of our ex-soldiers are working for 1 to 20 days each month - through Brisk Olive - as part-time invigilators for government exams. Our city-coordinators - who are also ex-soldiers - help them in delivering these duties. For such a duty, you get paid a daily rate - you receive your payment by the end of the following month, for duties delivered by you during this month. If you too want to take on such duties, then please click the link in the last column below for your state. Our staff will get back to you:</Text> 
        
        
        
        <Image style={styles.image} src="https://connex-education.com/wp-content/uploads/2025/04/New-Project-18-1.jpg" />
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableCell}>State</Text>
            <Text style={styles.tableCell}>Location</Text>
            <Text style={styles.tableCell}>Registration Link</Text>
          </View>
          {/* Static states, or make dynamic if DB has it */}
          <View style={styles.tableRow}>
            <Text style={styles.tableCell}>Uttar Pradesh</Text>
            <Text style={styles.tableCell}>Jhansi, Agra, Aligarh, Bareilly, Gorakhpur, Kanpur, Lucknow, Moradabad, Muzaffarnagar, Prayagraj, Varanasi, Sitapur</Text>
            <Text style={styles.tableCell}><Link src="https://forms.gle/px8C8wGVYiJi5wsH6">Link</Link></Text>
          </View>
          {/* Add other states */}
          <View style={styles.tableRow}>
            <Text style={styles.tableCell}>Haryana</Text>
            <Text style={styles.tableCell}>Kurukshetra,Hisar</Text>
            <Text style={styles.tableCell}><Link src="https://forms.gle/2JeKRCGQ2Hdrrydu9">Link</Link></Text>
          </View>
        </View>
      </View>

      {/* 3. Projects - Dynamic */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { fontSize: 14 }]}>3. Work in our Projects / Surveys / Audits & Consultancies</Text>
        <Text style={styles.bodyText}>
          Apart from jobs and Temporary Staffing opportunities (as mentioned above) you could also earn by doing various projects with us. We do projects, surveys, audits, sourcing, etc, across India - all through our ex-soldier members. In the past, we have done such assignments for Wipro, NIAL (Jewar Airport), Hans Foundation, WASH, etc.{'\n\n'}
          (a) A list of open projects is given below.{'\n\n'}
          To work on these projects through us, please fill in your details in the forms (the respective form links are given in the last column of the table below):
        </Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableCell}>Ser</Text>
            <Text style={styles.tableCell}>Project</Text>
            <Text style={styles.tableCell}>Description</Text>
            <Text style={styles.tableCell}>Link to Application Form</Text>
          </View>
          {/* Dynamic projects */}
          {projects.map((proj, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.tableCell}>{(index + 1).toString().padStart(2, '0')}.</Text>
              <Text style={styles.tableCell}>{proj.project_title || 'CSR Project'}</Text>
              <Text style={styles.tableCell}>{proj.project_description || 'Description...'}</Text>
              <Text style={styles.tableCell}><Link src={proj.project_apply_link || 'https://docs.google.com/forms...'}>Apply</Link></Text>
            </View>
          ))}
        </View>
        <Text style={styles.bodyText}>(b) Some Other Ongoing Projects, being executed by Brisk Olive.</Text>
        <Text style={styles.bodyText}>
          CSR at Jewar Airport, NIAL Our turn-key project execution teams (of mostly ex-soldiers) are executing diverse projects ranging from CSR (at the upcoming Jewar Airport next to Delhi NCR) to Operations & Maintenance assignments (at Rudrapur in Uttarakhand).
        </Text>
        <Image
                    style={styles.image}
                    src="src/images/logo 9.jpg"
                />
        
        <Text style={styles.bodyText}>
          Solar: Our Solar O&M Managers (Operations and Maintenance Manager) are deployed in Rudrapur (Uttarakhand). We will let you know once more new opportunities are available in this field.
        </Text>
        <Image
                    style={styles.image}
                    src="src/images/logo 7.jpg"
                />
        
      </View>

      <View style={styles.section}>
  <Text style={styles.sectionTitle}>4. Regional Partners</Text>
  <Text style={styles.bodyText}>
    Brisk Olive has Regional Partners (ex-soldiers) in the following states. 
    These partners receive work assignments from us from time to time.
  </Text>

  {regionalPartners.length === 0 ? (
    <Text style={styles.bodyText}>No regional partners registered yet.</Text>
  ) : (
    regionalPartners.map(([state, count], index) => (
      <Text key={state} style={styles.listItem}>
        {index + 1}. {state}: {count}{count !== 1 ? '' : ''}
      </Text>
    ))
  )}

  <Text style={[styles.bodyText, { marginTop: 12 }]}>
    If you too are an enterprising ex-soldier, and want to become our Regional Partner, please fill this form::{'\n'}
    <Link style={styles.link} src="https://script.google.com/a/briskolive.com/macros/s/AKfycbygIXSql_dd18Rv4lxclcmN9N8F_VrAwPrXCML8X5DiO5z4zuNxmascocMxnHPKjAYc/exec?v=newMember">
      Regional Partner Registration
    </Link>
  </Text>
</View>

      {/* Defence Projects */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>6. Defence Projects</Text>
        <Text style={styles.bodyText}>
          Brisk Olive is also doing Defence Projects for the Indian Army
Here are some interesting products built by us.
The Rapid Folding Floating Foot Assault Bridge for the Indian Army
In partnership with the Ministry of Defence Production, we have developed a unique foot assault bridge, for our dismounted soldiers to attack an enemy across a water obstacle. This patented bridge is man portable and can be launched extremely fast across obstacles up to 50 to 100 meters wide.
Apart from the Indian Army, the bridge provides a versatile solution to our Paramilitary Forces, and Disaster Relief forces at the Center and State levels, to instantly restore communications and provide relief to affected communities.
        </Text>
        <Image
                    style={styles.image}
                    src="src/images/logo 8.jpg"
                />
        <Image style={styles.image} src="https://briskolive.com/wp-content/uploads/2023/09/floods-1.jpg" />
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About Brisk Olive - Your Partner in Growth</Text>
                <Text style={styles.bodyText}>
                    Brisk Olive stands as a pioneer in the field of consultancy and operational support,
                    providing an unmatched advantage through our 30,000+ strong community of skilled
                    ex-soldiers. Our unique strength lies in our highly reliable operational field force, each
                    member possessing 15 to 20 years of experience across various domains. This expertise translates into exceptional reach, scale, and quality, ensuring that we consistently deliver on-time, on-cost, and on-quality results.
                </Text>
                <Link style={styles.link} src="https://briskolive.com/about/">About Us</Link>
                <Link style={styles.link} src="https://briskolive.com/expert-field-services/">Expert Field Services</Link>
                <Link style={styles.link} src="https://briskolive.com/recruitment/">Recruitment Services</Link>
                <Link style={styles.link} src="https://briskolive.com/members-area/">Members Page</Link>
                <Link style={styles.link} src="https://briskolive.com/contact/">Contact Us</Link>
      </View>

      <Text>Thanks!{'\n\n'}(Team Brisk Olive)</Text> 
     


      {/* Footer */}
      <View style={styles.footer}>
        <Text>Brisk Olive | Privacy Policy | Terms of Use | Contact Us | Unsubscribe</Text>
        <Text>G-203 Sector 63 Noida Uttar Pradesh India</Text>
        <Text>info@briskolive.com</Text>
        <Text>© 2026 Brisk Olive Business Solutions Pvt. Ltd.</Text>
      </View>
    </Page>
  </Document>
);

// Main Component with UI and Firebase
export default function BriskOliveNewsletterApp() {
  const [jobs, setJobs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [regionalPartners, setRegionalPartners] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const [j, p, rp] = await Promise.all([fetchOpenJobs(), fetchOpenProjects(), fetchRegionalPartners()]);
      setJobs(j);
      setProjects(p);
      setRegionalPartners(rp);
      setLoading(false);
    };
    loadData();
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: '50px' }}>Loading data from Firebase...</div>;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '30px', maxWidth: '1200px', margin: '0 auto', background: '#f8f9fa', borderRadius: '8px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
      <h1 style={{ color: '#4a7c2c', textAlign: 'center', marginBottom: '20px' }}>Brisk Olive Weekly Newsletter Generator</h1>
      <p style={{ textAlign: 'center', color: '#555', marginBottom: '30px' }}>
        Preview the dynamic newsletter below. Download as PDF.
      </p>

      <div style={{ border: '1px solid #ddd', height: '800px', marginBottom: '40px', background: '#fff', borderRadius: '8px', overflow: 'hidden' }}>
        <PDFViewer width="100%" height="100%">
          <NewsletterDocument jobs={jobs} projects={projects} regionalPartners={regionalPartners} />
        </PDFViewer>
      </div>

      <div style={{ textAlign: 'center' }}>
        <PDFDownloadLink
          document={<NewsletterDocument jobs={jobs} projects={projects} regionalPartners={regionalPartners} />}
          fileName="Brisk_Olive_Newsletter_12Jan2026.pdf"
          style={{
            backgroundColor: '#4a7c2c',
            color: 'white',
            padding: '15px 35px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize: '18px',
            fontWeight: 'bold',
            display: 'inline-block',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          }}
        >
          {({ loading }) => (loading ? 'Generating PDF...' : 'Download Newsletter PDF')}
        </PDFDownloadLink>
      </div>

      <p style={{ textAlign: 'center', marginTop: '20px', color: '#666', fontSize: '14px' }}>
        Visit us at <a href="https://briskolive.com" style={{ color: '#4a7c2c' }}>briskolive.com</a> | Contact: info@briskolive.com
      </p>
    </div>
  );
}