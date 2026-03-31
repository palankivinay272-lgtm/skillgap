import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, ScatterChart, Scatter, ZAxis
} from 'recharts';
import { toast } from 'sonner';
import { Settings, Users, Briefcase, TrendingDown, Plus, Filter, Download, Trash2, BookOpen, BarChart2, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { GoogleGenAI } from "@google/genai";
import { db } from '../firebase';
import { collection, doc, getDoc, getDocs, setDoc, query, where, onSnapshot, deleteDoc, writeBatch } from 'firebase/firestore';

export default function AdminDashboard() {
  const location = useLocation();
  const isSetupPage = location.pathname === '/requirements';
  
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [jobRoles, setJobRoles] = useState<any[]>([]);
  const [allSkills, setAllSkills] = useState<any[]>([]);
  const [studentPerformance, setStudentPerformance] = useState<any[]>([]);
  const [batches, setBatches] = useState<string[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [summaryMetrics, setSummaryMetrics] = useState({ totalStudents: 0, jobRolesCount: 0, placementReadyPercentage: 0 });
  const [skillResources, setSkillResources] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'analytics' | 'students' | 'resources'>('analytics');
  const [loading, setLoading] = useState(true);
  const [showFullReport, setShowFullReport] = useState(false);

  // AI Forecast State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiForecast, setAiForecast] = useState<string | null>(null);

  // Job Role Form
  const [newRoleTitle, setNewRoleTitle] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');

  // Requirement Form
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [skillId, setSkillId] = useState('');
  const [requiredProficiency, setRequiredProficiency] = useState(3);

  // Resource Form
  const [resourceSkillId, setResourceSkillId] = useState('');
  const [resourceTitle, setResourceTitle] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [resourceType, setResourceType] = useState<'video' | 'course' | 'article'>('article');

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch all skills
      const skillsSnap = await getDocs(collection(db, 'skills'));
      const skillsData = skillsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllSkills(skillsData);

      // 2. Fetch all job roles
      const rolesSnap = await getDocs(collection(db, 'job_roles'));
      const rolesData = rolesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setJobRoles(rolesData);

      // 3. Fetch all students and their skills
      const studentsSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')));
      const studentsData = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setSummaryMetrics(prev => ({ ...prev, totalStudents: studentsData.length, jobRolesCount: rolesData.length }));

      const allStudentSkills: any[] = [];
      for (const student of studentsData) {
        const studentSkillsSnap = await getDocs(collection(db, 'users', student.id, 'skills'));
        studentSkillsSnap.docs.forEach(doc => {
          allStudentSkills.push({ student_id: student.id, skill_id: doc.id, ...doc.data() });
        });
      }

      // 4. Fetch all requirements
      const allRequirements: any[] = [];
      for (const role of rolesData) {
        const reqsSnap = await getDocs(collection(db, 'job_roles', role.id, 'requirements'));
        reqsSnap.docs.forEach(doc => {
          allRequirements.push({ id: `${role.id}_${doc.id}`, job_role_id: role.id, skill_id: doc.id, ...doc.data() });
        });
      }
      setRequirements(allRequirements);

      // 5. Aggregate Heatmap Data
      const heatmap = skillsData.map((skill: any) => {
        const skillStudentProficiencies = allStudentSkills.filter(ss => ss.skill_id === skill.id).map(ss => ss.proficiency);
        const avgStudentProf = skillStudentProficiencies.length > 0 
          ? skillStudentProficiencies.reduce((a, b) => a + b, 0) / skillStudentProficiencies.length 
          : 0;
        
        const skillRequirements = allRequirements.filter(r => r.skill_id === skill.id).map(r => r.requiredProficiency);
        const avgRequiredProf = skillRequirements.length > 0
          ? skillRequirements.reduce((a, b) => a + b, 0) / skillRequirements.length
          : 0;

        return {
          skill: skill.name,
          skill_id: skill.id,
          avg_student_proficiency: avgStudentProf,
          avg_required_proficiency: avgRequiredProf
        };
      });
      setHeatmapData(heatmap);

      // 6. Aggregate Insights
      const insightsData = skillsData.map((skill: any) => {
        const skillStudentProficiencies = allStudentSkills.filter(ss => ss.skill_id === skill.id).map(ss => ss.proficiency);
        const avgProf = skillStudentProficiencies.length > 0 
          ? skillStudentProficiencies.reduce((a, b) => a + b, 0) / skillStudentProficiencies.length 
          : 0;
        
        const skillRequirements = allRequirements.filter(r => r.skill_id === skill.id).map(r => r.requiredProficiency);
        const targetProf = skillRequirements.length > 0
          ? skillRequirements.reduce((a, b) => a + b, 0) / skillRequirements.length
          : 0;

        const studentsWithGap = allStudentSkills.filter(ss => ss.skill_id === skill.id && ss.proficiency < targetProf).length;
        const gapPercentage = studentsData.length > 0 ? (studentsWithGap / studentsData.length) * 100 : 0;

        return {
          skill_name: skill.name,
          category: skill.category,
          avg_proficiency: avgProf,
          target_proficiency: targetProf,
          gap_percentage: gapPercentage,
          roles_count: allRequirements.filter(r => r.skill_id === skill.id).length
        };
      }).sort((a, b) => b.gap_percentage - a.gap_percentage);
      setInsights(insightsData);

      // 7. Student Performance
      const performance = studentsData.map((student: any) => {
        const studentSkills = allStudentSkills.filter(ss => ss.student_id === student.id);
        const avgProf = studentSkills.length > 0 
          ? studentSkills.reduce((a, b) => a + b, 0) / studentSkills.length 
          : 0;
        
        return {
          id: student.id,
          name: student.name,
          email: student.email,
          batch: student.batch,
          skills_tracked: studentSkills.length,
          avg_proficiency: avgProf,
          target_role: rolesData.find(r => r.id === student.targetRoleId)?.title || 'N/A'
        };
      });
      setStudentPerformance(performance);

      // 8. Batches
      const uniqueBatches = Array.from(new Set(studentsData.map((s: any) => s.batch).filter(Boolean)));
      setBatches(uniqueBatches as string[]);

    } catch (err) {
      console.error("Fetch error:", err);
      toast.error("An error occurred while loading data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchPerformanceByBatch = async (batch: string) => {
    // Already handled in fetchData aggregation, but if we want to filter:
    if (!batch) {
      fetchData();
      return;
    }
    setLoading(true);
    try {
      const studentsSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('batch', '==', batch)));
      const studentsData = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      
      const performance = [];
      for (const student of studentsData) {
        const studentSkillsSnap = await getDocs(collection(db, 'users', student.id, 'skills'));
        const studentSkills = studentSkillsSnap.docs.map(doc => doc.data());
        const avgProf = studentSkills.length > 0 
          ? studentSkills.reduce((a, b) => a + b.proficiency, 0) / studentSkills.length 
          : 0;
        
        performance.push({
          id: student.id,
          name: student.name,
          email: student.email,
          batch: student.batch,
          skills_tracked: studentSkills.length,
          avg_proficiency: avgProf,
          target_role: jobRoles.find(r => r.id === student.targetRoleId)?.title || 'N/A'
        });
      }
      setStudentPerformance(performance);
    } catch (err) {
      console.error("Error filtering by batch:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedBatch !== undefined) {
      fetchPerformanceByBatch(selectedBatch);
    }
  }, [selectedBatch]);

  const handleGenerateForecast = async () => {
    setAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const skillsContext = heatmapData.map(d => `${d.skill_name}: Avg Proficiency ${d.avg_proficiency.toFixed(1)}`).join(', ');
      const insightsContext = insights.map(i => `${i.skill_name}: ${i.gap_percentage}% gap`).join(', ');

      const prompt = `As an industry expert, analyze the following student skill data and provide a 12-month skill demand forecast.
      Current Skill Levels: ${skillsContext}
      Identified Gaps: ${insightsContext}
      
      Please provide:
      1. Top 3 emerging skills students should focus on.
      2. Industry trends relevant to these skills.
      3. Recommendations for curriculum adjustment.
      Keep it concise and professional.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      setAiForecast(response.text);
    } catch (err) {
      console.error("AI error:", err);
      toast.error("Failed to generate AI forecast");
    } finally {
      setAiLoading(false);
    }
  };

  const fetchSkillResources = async (skillId: string) => {
    if (!skillId) {
      setSkillResources([]);
      return;
    }
    try {
      const resSnap = await getDocs(collection(db, 'skills', skillId, 'resources'));
      const data = resSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSkillResources(data);
    } catch (err) {
      console.error("Error fetching resources:", err);
    }
  };

  useEffect(() => {
    if (resourceSkillId) {
      fetchSkillResources(resourceSkillId);
    } else {
      setSkillResources([]);
    }
  }, [resourceSkillId]);

  const handleRemoveRequirement = async (id: string) => {
    const [roleId, skillId] = id.split('_');
    try {
      await deleteDoc(doc(db, 'job_roles', roleId, 'requirements', skillId));
      toast.success("Requirement removed successfully");
      fetchData();
    } catch (err) {
      console.error("Error removing requirement:", err);
      toast.error("Failed to remove requirement");
    }
  };

  const handleAddJobRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleTitle.trim()) {
      toast.error("Role title is required");
      return;
    }

    try {
      const roleId = newRoleTitle.toLowerCase().replace(/\s+/g, '_');
      await setDoc(doc(db, 'job_roles', roleId), {
        title: newRoleTitle,
        description: newRoleDesc,
        createdAt: new Date().toISOString()
      });
      toast.success("Job role created successfully");
      fetchData();
      setNewRoleTitle('');
      setNewRoleDesc('');
    } catch (err) {
      console.error("Error adding job role:", err);
      toast.error("Failed to create job role");
    }
  };

  const handleDeleteJobRole = async (id: string) => {
    if (!confirm("Are you sure? This will also delete all skill requirements for this role.")) return;
    
    try {
      await deleteDoc(doc(db, 'job_roles', id));
      toast.success("Job role deleted");
      fetchData();
    } catch (err) {
      console.error("Error deleting job role:", err);
      toast.error("Failed to delete job role");
    }
  };

  const handleAddRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoleId) {
      toast.error("Please select a job role");
      return;
    }
    if (!skillId) {
      toast.error("Please select a skill");
      return;
    }

    try {
      await setDoc(doc(db, 'job_roles', selectedRoleId, 'requirements', skillId), {
        requiredProficiency: requiredProficiency
      });
      toast.success("Skill requirement added");
      fetchData();
      setSkillId('');
    } catch (err) {
      console.error("Error adding requirement:", err);
      toast.error("Failed to add requirement");
    }
  };

  const handleAddResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resourceSkillId || !resourceTitle.trim() || !resourceUrl.trim()) {
      toast.error("All fields are required");
      return;
    }

    try {
      const resourceId = resourceTitle.toLowerCase().replace(/\s+/g, '_');
      await setDoc(doc(db, 'skills', resourceSkillId, 'resources', resourceId), {
        title: resourceTitle,
        url: resourceUrl,
        type: resourceType,
        createdAt: new Date().toISOString()
      });
      toast.success("Resource added successfully");
      setResourceTitle('');
      setResourceUrl('');
      fetchSkillResources(resourceSkillId);
    } catch (err) {
      console.error("Error adding resource:", err);
      toast.error("Failed to add resource");
    }
  };

  const handleRemoveResource = async (resourceId: string) => {
    if (!confirm("Are you sure you want to delete this resource?")) return;
    
    try {
      await deleteDoc(doc(db, 'skills', resourceSkillId, 'resources', resourceId));
      toast.success("Resource deleted");
      fetchSkillResources(resourceSkillId);
    } catch (err) {
      console.error("Error deleting resource:", err);
      toast.error("Failed to delete resource");
    }
  };

  const handleExport = () => {
    if (studentPerformance.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = ["Name", "Email", "Batch", "Skills Tracked", "Avg Proficiency", "Target Role"];
    const csvRows = studentPerformance.map(student => [
      `"${student.name}"`,
      `"${student.email}"`,
      `"${student.batch || 'N/A'}"`,
      student.skills_tracked,
      student.avg_proficiency?.toFixed(2) || 0,
      `"${student.target_role || 'N/A'}"`
    ]);

    const csvContent = [headers, ...csvRows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `student_performance_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div>Loading...</div>;

  // Heatmap logic: Map skill to a color based on the gap
  const getHeatmapColor = (gap: number) => {
    if (gap <= 0.5) return '#22c55e'; // Green (Low gap)
    if (gap <= 1.5) return '#f59e0b'; // Amber (Medium gap)
    return '#ef4444'; // Red (High gap)
  };

  return (
    <div className="space-y-8">
      {/* Navigation Tabs */}
      {!isSetupPage && (
        <div className="flex items-center gap-4 border-b border-slate-200 pb-1">
          <button 
            onClick={() => setActiveTab('analytics')}
            className={cn(
              "px-4 py-2 font-semibold text-sm transition-all border-b-2",
              activeTab === 'analytics' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            Analytics Overview
          </button>
          <button 
            onClick={() => setActiveTab('students')}
            className={cn(
              "px-4 py-2 font-semibold text-sm transition-all border-b-2",
              activeTab === 'students' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            Student Performance
          </button>
          <button 
            onClick={() => setActiveTab('resources')}
            className={cn(
              "px-4 py-2 font-semibold text-sm transition-all border-b-2",
              activeTab === 'resources' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            Resource Management
          </button>
        </div>
      )}

      {/* Overview Cards - Hide on setup page for focus */}
      {!isSetupPage && activeTab === 'analytics' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                <Users size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Students</p>
                <p className="text-2xl font-bold text-slate-900">{(summaryMetrics.totalStudents || 0).toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
                <Briefcase size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-500">Job Roles Defined</p>
                <p className="text-2xl font-bold text-slate-900">{summaryMetrics.jobRolesCount}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center text-red-600">
                <TrendingDown size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-500">Avg. Skill Gap</p>
                <p className="text-2xl font-bold text-slate-900">
                  {(Array.isArray(heatmapData) ? heatmapData.reduce((acc, d) => acc + (d.avg_required_proficiency - d.avg_student_proficiency), 0) / (heatmapData.length || 1) : 0).toFixed(1)}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center text-green-600">
                <Filter size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-500">Placement Ready</p>
                <p className="text-2xl font-bold text-slate-900">{summaryMetrics.placementReadyPercentage}%</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Curriculum Insights Section - Hide on setup page */}
      {!isSetupPage && activeTab === 'analytics' && (
        <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <TrendingDown size={20} className="text-red-600" />
                Institutional Curriculum Insights
              </h3>
              <p className="text-sm text-slate-500 mt-1">Identifying critical skill gaps across the student population.</p>
            </div>
            <div className="flex items-center gap-2">
              {Array.isArray(insights) && insights.length > 0 && (
                <span className="text-xs font-bold px-2 py-1 bg-red-50 text-red-600 rounded-lg">Critical Gaps Detected</span>
              )}
            </div>
          </div>

          {!Array.isArray(insights) || insights.length === 0 ? (
            <div className="py-12 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-100">
              <TrendingDown size={48} className="mx-auto text-slate-200 mb-4" />
              <h4 className="text-slate-900 font-bold">No Curriculum Insights Available</h4>
              <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
                Add job roles and industry requirements below to see how your students' skills compare to industry standards.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={Array.isArray(insights) ? insights.slice(0, 8) : []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="skill_name" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} label={{ value: '% Students with Gap', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#64748b', fontSize: 10 } }} />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-3 border border-slate-100 shadow-xl rounded-lg">
                              <p className="font-bold text-slate-900">{data.skill_name}</p>
                              <p className="text-sm text-red-600 font-bold">{data.gap_percentage}% students have a gap</p>
                              <p className="text-xs text-slate-500 mt-1">Avg: {data.avg_proficiency} | Target: {data.target_proficiency}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="gap_percentage" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Top Critical Skills (Action Required)</h4>
                <div className="space-y-3">
                  {Array.isArray(insights) && insights.slice(0, 5).map((item, i) => (
                    <div key={i} className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-900">{item.skill_name}</p>
                        <p className="text-xs text-slate-500">{item.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-red-600">{item.gap_percentage}%</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Gap Rate</p>
                      </div>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={() => setShowFullReport(true)}
                  className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  View Full Curriculum Report
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Skill Demand vs Supply */}
      {!isSetupPage && activeTab === 'analytics' && Array.isArray(insights) && insights.length > 0 && (
        <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <BarChart2 size={20} className="text-blue-600" />
                Skill Demand vs. Student Proficiency
              </h3>
              <p className="text-sm text-slate-500 mt-1">Comparing how many job roles require a skill vs. the average student proficiency.</p>
            </div>
            <button 
              onClick={handleExport}
              className="px-4 py-2 bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-2"
            >
              Export Report (CSV)
            </button>
          </div>
          
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={Array.isArray(insights) ? insights.slice(0, 8) : []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="skill_name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                <YAxis yAxisId="left" orientation="left" stroke="#3b82f6" axisLine={false} tickLine={false} tick={{fill: '#3b82f6', fontSize: 10}} label={{ value: 'Roles Requiring', angle: -90, position: 'insideLeft', style: { fill: '#3b82f6', fontSize: 10 } }} />
                <YAxis yAxisId="right" orientation="right" stroke="#10b981" axisLine={false} tickLine={false} tick={{fill: '#10b981', fontSize: 10}} label={{ value: 'Avg Proficiency', angle: 90, position: 'insideRight', style: { fill: '#10b981', fontSize: 10 } }} />
                <Tooltip 
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                <Bar yAxisId="left" dataKey="roles_count" name="Roles Requiring" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                <Bar yAxisId="right" dataKey="avg_proficiency" name="Avg Student Proficiency" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Full Report Modal */}
      {showFullReport && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Full Curriculum Gap Report</h3>
                <p className="text-sm text-slate-500">Comprehensive analysis of all skill gaps across the institution.</p>
              </div>
              <button 
                onClick={() => setShowFullReport(false)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
              >
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <table className="w-full text-left">
                <thead className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="pb-4">Skill</th>
                    <th className="pb-4">Category</th>
                    <th className="pb-4">Avg. Proficiency</th>
                    <th className="pb-4">Target</th>
                    <th className="pb-4">Gap Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {Array.isArray(insights) && insights.map((item, i) => (
                    <tr key={i} className="group">
                      <td className="py-4 font-bold text-slate-900">{item.skill_name}</td>
                      <td className="py-4 text-slate-500">{item.category}</td>
                      <td className="py-4 text-slate-600">{item.avg_proficiency} / 5.0</td>
                      <td className="py-4 text-slate-600">{item.target_proficiency} / 5.0</td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full",
                                item.gap_percentage > 50 ? "bg-red-500" : "bg-orange-500"
                              )}
                              style={{ width: `${item.gap_percentage}%` }}
                            />
                          </div>
                          <span className={cn(
                            "text-xs font-bold w-12 text-right",
                            item.gap_percentage > 50 ? "text-red-600" : "text-orange-600"
                          )}>
                            {item.gap_percentage}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Student Performance Tab */}
      {!isSetupPage && activeTab === 'students' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Student Performance Overview</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-1 bg-blue-50 text-blue-600 rounded-lg">{Array.isArray(studentPerformance) ? studentPerformance.length : 0} Students</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-sm font-semibold">
                <tr>
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4">Target Role</th>
                  <th className="px-6 py-4">Skills Tracked</th>
                  <th className="px-6 py-4">Avg. Proficiency</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.isArray(studentPerformance) && studentPerformance.map((student, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                          {student.name[0]}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{student.name}</p>
                          <p className="text-xs text-slate-500">{student.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-600">{student.target_role || 'Not Set'}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{student.skills_tracked}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-600" 
                            style={{ width: `${(student.avg_proficiency / 5) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-700">{student.avg_proficiency?.toFixed(1) || '0.0'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg",
                        student.avg_proficiency >= 4 ? "bg-green-50 text-green-600" :
                        student.avg_proficiency >= 2.5 ? "bg-blue-50 text-blue-600" :
                        "bg-orange-50 text-orange-600"
                      )}>
                        {student.avg_proficiency >= 4 ? 'Advanced' : student.avg_proficiency >= 2.5 ? 'Growing' : 'Needs Focus'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resource Management Tab */}
      {!isSetupPage && activeTab === 'resources' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Plus size={20} className="text-blue-600" />
              Add Learning Resource
            </h3>
            <form onSubmit={handleAddResource} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Select Skill</label>
                <select 
                  value={resourceSkillId}
                  onChange={(e) => setResourceSkillId(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  required
                >
                  <option value="">Choose a skill...</option>
                  {Array.isArray(allSkills) && allSkills.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Resource Title</label>
                <input 
                  type="text" 
                  value={resourceTitle}
                  onChange={(e) => setResourceTitle(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="e.g. React Docs"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">URL</label>
                <input 
                  type="url" 
                  value={resourceUrl}
                  onChange={(e) => setResourceUrl(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="https://..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
                <select 
                  value={resourceType}
                  onChange={(e) => setResourceType(e.target.value as any)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="article">Article</option>
                  <option value="video">Video</option>
                  <option value="course">Course</option>
                </select>
              </div>
              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-blue-100"
              >
                Add Resource
              </button>
            </form>
          </div>
          <div className="lg:col-span-2 bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <BookOpen size={20} className="text-purple-600" />
              Resource Library Overview
            </h3>
            
            {!resourceSkillId ? (
              <div className="text-center py-12 text-slate-400 italic">
                <BookOpen size={48} className="mx-auto mb-4 opacity-20" />
                <p>Select a skill to view and manage its resources.</p>
              </div>
            ) : skillResources.length === 0 ? (
              <div className="text-center py-12 text-slate-400 italic">
                <p>No resources found for this skill. Add one on the left.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {skillResources.map((res) => (
                  <div key={res.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-sm",
                        res.type === 'video' ? "bg-red-500" : res.type === 'course' ? "bg-blue-500" : "bg-green-500"
                      )}>
                        <BookOpen size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{res.title}</p>
                        <a href={res.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate max-w-[300px] block">
                          {res.url}
                        </a>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleRemoveResource(res.id)}
                      className="p-2 text-slate-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={cn("grid grid-cols-1 lg:grid-cols-3 gap-8", isSetupPage && "pt-4")}>
        {/* Job Role Setup */}
        {(isSetupPage || activeTab === 'analytics') && (
          <div className="lg:col-span-1 space-y-8">
          <div className={cn(
            "bg-white p-8 rounded-2xl border shadow-sm transition-all",
            isSetupPage ? "border-blue-200 ring-4 ring-blue-50" : "border-slate-100"
          )}>
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Plus size={20} className="text-blue-600" />
              Create Job Role
            </h3>
            <form onSubmit={handleAddJobRole} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Role Title</label>
                <input 
                  type="text" 
                  value={newRoleTitle}
                  onChange={(e) => setNewRoleTitle(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Backend Engineer"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                <textarea 
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                  placeholder="Describe the role and its responsibilities..."
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-blue-100"
              >
                Create Role
              </button>
            </form>

            {jobRoles.length > 0 && (
              <div className="mt-8 pt-8 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Existing Roles</h4>
                <div className="space-y-2">
                  {jobRoles.map(role => (
                    <div key={role.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg group">
                      <span className="text-sm font-medium text-slate-700">{role.title}</span>
                      <button 
                        onClick={() => handleDeleteJobRole(role.id)}
                        className="p-1 text-slate-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={cn(
            "bg-white p-8 rounded-2xl border shadow-sm transition-all",
            isSetupPage ? "border-blue-200 ring-4 ring-blue-50" : "border-slate-100"
          )}>
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Settings size={20} className="text-blue-600" />
              Assign Skills to Role
            </h3>
            <form onSubmit={handleAddRequirement} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Select Role</label>
                <select 
                  value={selectedRoleId}
                  onChange={(e) => setSelectedRoleId(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Choose a role...</option>
                  {Array.isArray(jobRoles) && jobRoles.map(r => (
                    <option key={r.id} value={r.id}>{r.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Skill Required</label>
                <select 
                  value={skillId}
                  onChange={(e) => setSkillId(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select a skill...</option>
                  {Array.isArray(allSkills) && allSkills.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Required Proficiency (1-5)</label>
                <input 
                  type="range" 
                  min="1" 
                  max="5" 
                  value={requiredProficiency}
                  onChange={(e) => setRequiredProficiency(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-blue-100"
              >
                Add Skill Requirement
              </button>
              <p className="text-xs text-slate-400 mt-4 italic">
                Note: Roles will only appear in the student's gap analysis once at least one skill requirement is added.
              </p>
            </form>
          </div>
        </div>
      )}

      {/* Aggregate Skill Gap Heatmap */}
        {(isSetupPage || activeTab === 'analytics') ? (
          <div className="lg:col-span-2 bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-bold text-slate-900">Institutional Skill Gap Heatmap</h3>
              <div className="flex items-center gap-3">
                <select 
                  value={selectedBatch}
                  onChange={(e) => setSelectedBatch(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Batches</option>
                  {batches.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <button className="flex items-center gap-2 text-sm text-blue-600 font-semibold hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">
                  <Download size={16} />
                  Export Report
                </button>
              </div>
            </div>

            {/* AI Skill Demand Forecast */}
            <div className="mb-8 p-6 bg-blue-50/50 rounded-2xl border border-blue-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-blue-600" />
                  <h4 className="font-bold text-slate-900">AI Skill Demand Forecast</h4>
                </div>
                <button 
                  onClick={handleGenerateForecast}
                  disabled={aiLoading}
                  className="text-xs font-bold bg-white border border-blue-200 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-600 hover:text-white transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
                >
                  {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Generate Forecast
                </button>
              </div>
              {aiForecast ? (
                <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-white p-4 rounded-xl border border-blue-50 shadow-sm">
                  {aiForecast}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">Generate an AI-powered forecast based on current student performance and industry trends.</p>
              )}
            </div>
            
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={Array.isArray(heatmapData) ? heatmapData : []}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" domain={[0, 5]} tick={{ fill: '#64748b' }} />
                  <YAxis dataKey="skill" type="category" tick={{ fill: '#64748b', fontSize: 12 }} width={100} />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const gap = (data.avg_required_proficiency - data.avg_student_proficiency).toFixed(1);
                        return (
                          <div className="bg-white p-3 border border-slate-100 shadow-xl rounded-lg">
                            <p className="font-bold text-slate-900 mb-1">{data.skill}</p>
                            <p className="text-sm text-slate-600">Avg. Student: {data.avg_student_proficiency.toFixed(1)}</p>
                            <p className="text-sm text-slate-600">Avg. Required: {data.avg_required_proficiency.toFixed(1)}</p>
                            <p className={cn(
                              "text-sm font-bold mt-1",
                              parseFloat(gap) > 1.5 ? "text-red-600" : "text-green-600"
                            )}>Gap: {gap}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="avg_student_proficiency" radius={[0, 4, 4, 0]}>
                    {Array.isArray(heatmapData) && heatmapData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={getHeatmapColor(entry.avg_required_proficiency - entry.avg_student_proficiency)} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-6 flex items-center justify-center gap-8 text-xs font-medium text-slate-500">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span>Low Gap (Ready)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <span>Medium Gap (Focus)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span>High Gap (Critical)</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white rounded-2xl border border-blue-200 shadow-sm overflow-hidden ring-4 ring-blue-50">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Active Job Role Requirements</h3>
                <span className="text-xs font-bold px-2 py-1 bg-blue-100 text-blue-700 rounded-lg">
                  {Array.isArray(requirements) ? requirements.length : 0} Requirements Active
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-500 text-sm font-semibold">
                    <tr>
                      <th className="px-6 py-4">Job Role</th>
                      <th className="px-6 py-4">Skill</th>
                      <th className="px-6 py-4">Required Level</th>
                      <th className="px-6 py-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {!Array.isArray(requirements) || requirements.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">
                          No requirements added yet. Use the forms on the left to get started.
                        </td>
                      </tr>
                    ) : (
                      Array.isArray(requirements) && requirements.map((req, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-medium text-slate-900">{req.job_role}</p>
                            <p className="text-xs text-slate-500 truncate max-w-[200px]">{req.job_description}</p>
                          </td>
                          <td className="px-6 py-4 text-slate-600">{req.skill_name}</td>
                          <td className="px-6 py-4">
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map(star => (
                                <div 
                                  key={star} 
                                  className={cn(
                                    "w-2 h-2 rounded-full",
                                    star <= req.required_proficiency ? "bg-blue-600" : "bg-slate-200"
                                  )}
                                />
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <button 
                              onClick={() => handleRemoveRequirement(req.id)}
                              className="text-red-600 hover:text-red-700 text-sm font-semibold flex items-center gap-1"
                            >
                              <Trash2 size={14} />
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detailed Requirements Table - Only show on main dashboard if not on setup page */}
      {!isSetupPage && activeTab === 'analytics' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-lg font-bold text-slate-900">Active Job Role Requirements</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-sm font-semibold">
                <tr>
                  <th className="px-6 py-4">Job Role</th>
                  <th className="px-6 py-4">Skill</th>
                  <th className="px-6 py-4">Required Level</th>
                  <th className="px-6 py-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.isArray(requirements) && requirements.map((req, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-900">{req.job_role}</p>
                      <p className="text-xs text-slate-500 truncate max-w-[200px]">{req.job_description}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{req.skill_name}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(star => (
                          <div 
                            key={star} 
                            className={cn(
                              "w-2 h-2 rounded-full",
                              star <= req.required_proficiency ? "bg-blue-600" : "bg-slate-200"
                            )}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => handleRemoveRequirement(req.id)}
                        className="text-red-600 hover:text-red-700 text-sm font-semibold"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
