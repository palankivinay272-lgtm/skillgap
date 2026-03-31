import { db } from './firebase';
import { collection, doc, setDoc, getDocs, query, limit } from 'firebase/firestore';

const initialSkills = [
  { name: "React", category: "Frontend" },
  { name: "Node.js", category: "Backend" },
  { name: "SQL", category: "Database" },
  { name: "Python", category: "Data Science" },
  { name: "Java", category: "Backend" },
  { name: "TypeScript", category: "Frontend" },
  { name: "Docker", category: "DevOps" },
  { name: "AWS", category: "Cloud" },
  { name: "Git", category: "Tools" },
  { name: "Agile", category: "Process" }
];

const initialJobRoles = [
  { title: "Frontend Developer", description: "Builds the user interface of web applications." },
  { title: "Backend Developer", description: "Handles server-side logic and databases." },
  { title: "Full Stack Developer", description: "Works on both frontend and backend." },
  { title: "Data Scientist", description: "Analyzes data and builds models." }
];

export const seedInitialData = async () => {
  try {
    const skillsSnap = await getDocs(query(collection(db, 'skills'), limit(1)));
    if (skillsSnap.empty) {
      console.log("Seeding initial skills...");
      for (const skill of initialSkills) {
        const skillId = skill.name.toLowerCase().replace(/\s+/g, '_');
        await setDoc(doc(db, 'skills', skillId), skill);
      }
    }

    const rolesSnap = await getDocs(query(collection(db, 'job_roles'), limit(1)));
    if (rolesSnap.empty) {
      console.log("Seeding initial job roles...");
      for (const role of initialJobRoles) {
        const roleId = role.title.toLowerCase().replace(/\s+/g, '_');
        await setDoc(doc(db, 'job_roles', roleId), role);
      }
    }
    console.log("Seeding complete!");
  } catch (err) {
    console.error("Seeding error:", err);
  }
};
