import React, { useState, useEffect } from 'react';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { toast } from 'sonner';
import { Plus, Star, AlertCircle, CheckCircle2, TrendingUp, Lightbulb, Briefcase, ChevronRight, X, Sparkles, Loader2, BookOpen, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { GoogleGenAI, Type } from "@google/genai";
import { db } from '../firebase';
import { collection, doc, getDoc, getDocs, setDoc, query, where, onSnapshot, deleteDoc } from 'firebase/firestore';

export default function StudentDashboard({ user }: { user: any }) {
  const [skills, setSkills] = useState<any[]>([]);
  const [gapData, setGapData] = useState<any[]>([]);
  const [allSkills, setAllSkills] = useState<any[]>([]);
  const [jobRoles, setJobRoles] = useState<any[]>([]);
  const [selectedSkill, setSelectedSkill] = useState('');
  const [proficiency, setProficiency] = useState(3);
  const [loading, setLoading] = useState(true);
  const [selectedRoleForModal, setSelectedRoleForModal] = useState<any | null>(null);
  const [targetRoleId, setTargetRoleId] = useState<string | null>(user.target_role_id || null);
  const [recommendedResources, setRecommendedResources] = useState<any[]>([]);
  const [completedResources, setCompletedResources] = useState<string[]>([]);
  const [peerComparison, setPeerComparison] = useState<any[]>([]);
  
  // AI Roadmap State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRoadmap, setAiRoadmap] = useState<any | null>(null);
  const [selectedRoleForAI, setSelectedRoleForAI] = useState('');

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Fetch all skills
      const skillsSnap = await getDocs(collection(db, 'skills'));
      const allSkillsData = skillsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setAllSkills(allSkillsData);

      // 2. Fetch all job roles
      const rolesSnap = await getDocs(collection(db, 'job_roles'));
      const rolesData = rolesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setJobRoles(rolesData);

      // 3. Fetch student's skills
      const studentSkillsSnap = await getDocs(collection(db, 'users', user.id, 'skills'));
      const studentSkillsData = studentSkillsSnap.docs.reduce((acc: any, doc) => {
        acc[doc.id] = doc.data().proficiency;
        return acc;
      }, {});

      const skillsWithProficiency = allSkillsData.map((s: any) => ({
        ...s,
        proficiency: studentSkillsData[s.id] || 0
      }));
      setSkills(skillsWithProficiency);

      // 4. Fetch target role and gaps
      const userDoc = await getDoc(doc(db, 'users', user.id));
      const userData = userDoc.data();
      if (userData?.targetRoleId) {
        setTargetRoleId(userData.targetRoleId);
        
        // Fetch requirements for target role
        const reqsSnap = await getDocs(collection(db, 'job_roles', userData.targetRoleId, 'requirements'));
        const reqsData = reqsSnap.docs.map(doc => ({ skill_id: doc.id, ...doc.data() }));
        
        const gaps = reqsData.map((req: any) => {
          const skill = allSkillsData.find((s: any) => s.id === req.skill_id);
          const studentProf = studentSkillsData[req.skill_id] || 0;
          return {
            skill_id: req.skill_id,
            skill_name: skill?.name || 'Unknown',
            required_proficiency: req.requiredProficiency,
            student_proficiency: studentProf,
            gap: Math.max(0, req.requiredProficiency - studentProf),
            job_role: rolesData.find((r: any) => r.id === userData.targetRoleId)?.title || 'Target Role'
          };
        });
        setGapData(gaps);
      }

      // 5. Fetch completed resources
      const completedSnap = await getDocs(collection(db, 'users', user.id, 'completed_resources'));
      setCompletedResources(completedSnap.docs.map(doc => doc.id));

    } catch (err) {
      console.error("Fetch error:", err);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const fetchResources = async () => {
    if (gapData.length === 0) return;
    
    try {
      const gaps = gapData.filter(d => d.gap > 0);
      const allResources: any[] = [];
      
      for (const gap of gaps) {
        const resSnap = await getDocs(collection(db, 'skills', gap.skill_id, 'resources'));
        resSnap.docs.forEach(doc => {
          allResources.push({ id: doc.id, ...doc.data() });
        });
      }
      setRecommendedResources(allResources);
    } catch (err) {
      console.error("Error fetching resources:", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  useEffect(() => {
    if (gapData.length > 0) {
      fetchResources();
    }
  }, [gapData]);

  const handleUpdateTargetRole = async (roleId: string) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.id), { targetRoleId: roleId }, { merge: true });
      setTargetRoleId(roleId);
      toast.success("Target role updated!");
      fetchData();
    } catch (err) {
      console.error("Error updating target role:", err);
      toast.error("Failed to update target role");
    }
  };

  const handleUpdateSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSkill || !user) return;

    try {
      await setDoc(doc(db, 'users', user.id, 'skills', selectedSkill), {
        proficiency: proficiency
      });
      toast.success("Skill proficiency updated!");
      fetchData();
    } catch (err) {
      console.error("Error updating skill:", err);
      toast.error("Failed to update skill");
    }
  };

  const handleToggleResource = async (resourceId: string) => {
    if (!user) return;
    const isCompleted = completedResources.includes(resourceId);
    
    try {
      if (!isCompleted) {
        await setDoc(doc(db, 'users', user.id, 'completed_resources', resourceId), {
          completedAt: new Date().toISOString()
        });
        setCompletedResources(prev => [...prev, resourceId]);
        toast.success("Resource marked as completed!");
      }
    } catch (err) {
      console.error("Error toggling resource:", err);
      toast.error("Failed to update resource status");
    }
  };

  const handleGenerateRoadmap = async () => {
    if (!selectedRoleForAI && skills.length > 0) {
      toast.info("Select a target role for a more personalized roadmap!");
    }

    setAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const studentSkillsStr = skills
        .filter(s => s.proficiency)
        .map(s => `${s.name} (Level ${s.proficiency})`)
        .join(', ');

      let prompt = '';
      if (selectedRoleForAI) {
        const role = jobRoles.find(r => r.id === parseInt(selectedRoleForAI));
        const roleRequirements = gapData
          .filter(d => d.job_role === role?.title)
          .map(d => `${d.skill_name} (Required: ${d.required_proficiency})`)
          .join(', ');
          
        prompt = `I am a student with the following skills: ${studentSkillsStr || 'None yet'}. 
        I want to become a ${role?.title}. The requirements are: ${roleRequirements}. 
        Please provide:
        1. A structured preparation roadmap.
        2. A typical job description for this role for a fresher.
        3. A detailed skill gap analysis between my current skills and the role requirements.
        4. Three specific project ideas (Beginner, Intermediate, Advanced) that would help me bridge my top skill gaps.
        Return the response as a JSON object with 'summary', 'jobDescription', 'steps' (array of objects with 'title' and 'description'), 'resources' (array of strings), 'gaps' (array of objects with 'skill', 'current', 'required', 'gap', and 'recommendation'), and 'projects' (array of objects with 'level', 'title', 'description', and 'skillsLearned').`;
      } else {
        prompt = `I am a fresher student looking for campus placements in the software industry. My current skills are: ${studentSkillsStr || 'None yet'}. 
        Please provide:
        1. A general placement preparation roadmap for freshers, covering aptitude, core CS subjects, and coding. 
        2. A general job description of what a 'Software Engineer Trainee' or 'Associate Engineer' role looks like for a fresher.
        3. A general skill gap analysis based on industry standards for freshers vs my current skills.
        4. Three specific project ideas (Beginner, Intermediate, Advanced) that would help me bridge my top skill gaps.
        Return the response as a JSON object with 'summary', 'jobDescription', 'steps' (array of objects with 'title' and 'description'), 'resources' (array of strings), 'gaps' (array of objects with 'skill', 'current', 'required', 'gap', and 'recommendation'), and 'projects' (array of objects with 'level', 'title', 'description', and 'skillsLearned').`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              jobDescription: { type: Type.STRING },
              steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING }
                  },
                  required: ["title", "description"]
                }
              },
              resources: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              gaps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    skill: { type: Type.STRING },
                    current: { type: Type.STRING },
                    required: { type: Type.STRING },
                    gap: { type: Type.STRING },
                    recommendation: { type: Type.STRING }
                  },
                  required: ["skill", "current", "required", "gap", "recommendation"]
                }
              },
              projects: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    level: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    skillsLearned: { type: Type.STRING }
                  },
                  required: ["level", "title", "description", "skillsLearned"]
                }
              }
            },
            required: ["summary", "jobDescription", "steps", "resources", "gaps", "projects"]
          }
        }
      });

      setAiRoadmap(JSON.parse(response.text));
      toast.success("AI Roadmap generated successfully!");
    } catch (error) {
      console.error("AI Roadmap Error:", error);
      toast.error("Failed to generate AI roadmap. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  const recommendations = gapData.filter(d => d.gap > 0).sort((a, b) => b.gap - a.gap);

  return (
    <div className="space-y-8">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
              <Star size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Skills Tracked</p>
              <p className="text-2xl font-bold text-slate-900">{Array.isArray(skills) ? skills.filter(s => s.proficiency).length : 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
              <AlertCircle size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Critical Gaps</p>
              <p className="text-2xl font-bold text-slate-900">{Array.isArray(gapData) ? gapData.filter(d => d.gap >= 2).length : 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
              <BookOpen size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Learning Progress</p>
              <p className="text-2xl font-bold text-slate-900">
                {recommendedResources.length > 0 
                  ? Math.round((completedResources.length / recommendedResources.length) * 100) 
                  : 0}%
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
              <Briefcase size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-500">Target Role</p>
              <select 
                value={targetRoleId || ''} 
                onChange={(e) => handleUpdateTargetRole(e.target.value)}
                className="text-sm font-bold text-slate-900 bg-transparent border-none p-0 focus:ring-0 w-full truncate"
              >
                <option value="">Set Target Role</option>
                {Array.isArray(jobRoles) && jobRoles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Skill Update Form */}
        <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-blue-600" />
            Update Your Proficiency
          </h3>
          <form onSubmit={handleUpdateSkill} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Select Skill</label>
              <select 
                value={selectedSkill}
                onChange={(e) => setSelectedSkill(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Choose a skill...</option>
                {Array.isArray(allSkills) && allSkills.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Proficiency Level (1-5)</label>
              <div className="flex items-center gap-4">
                <input 
                  type="range" 
                  min="1" 
                  max="5" 
                  value={proficiency}
                  onChange={(e) => setProficiency(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <span className="w-8 h-8 flex items-center justify-center bg-blue-600 text-white rounded-lg font-bold">
                  {proficiency}
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>Beginner</span>
                <span>Intermediate</span>
                <span>Expert</span>
              </div>
            </div>
            <button 
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <Plus size={20} />
              Update Skill
            </button>
          </form>
        </div>

        {/* Gap Analysis Chart */}
        <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Skill Gap Analysis</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={gapData.slice(0, 6)}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="skill_name" tick={{ fill: '#64748b', fontSize: 12 }} />
                <PolarRadiusAxis angle={30} domain={[0, 5]} />
                <Radar
                  name="Required"
                  dataKey="required_proficiency"
                  stroke="#94a3b8"
                  fill="#94a3b8"
                  fillOpacity={0.3}
                />
                <Radar
                  name="Your Level"
                  dataKey="student_proficiency"
                  stroke="#2563eb"
                  fill="#2563eb"
                  fillOpacity={0.5}
                />
                <Tooltip />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Available Career Paths */}
      <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
          <Briefcase size={20} className="text-blue-600" />
          Available Career Paths
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {jobRoles.map((role) => (
            <div key={role.id} className="p-6 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-white hover:shadow-md transition-all group">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Briefcase size={20} />
                </div>
                <span className="text-xs font-semibold px-2 py-1 bg-blue-50 text-blue-600 rounded-full">
                  {gapData.filter(d => d.job_role === role.title).length} Skills
                </span>
              </div>
              <h4 className="font-bold text-slate-900 mb-2">{role.title}</h4>
              <p className="text-sm text-slate-500 line-clamp-2 mb-4">{role.description || 'No description provided.'}</p>
              <div 
                onClick={() => setSelectedRoleForModal(role)}
                className="flex items-center gap-2 text-sm font-semibold text-blue-600 cursor-pointer hover:text-blue-700 transition-colors"
              >
                View Requirements <ChevronRight size={16} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Requirements Modal */}
      {selectedRoleForModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">{selectedRoleForModal.title}</h3>
                <p className="text-slate-500 mt-1">{selectedRoleForModal.description || 'Detailed skill requirements for this role.'}</p>
              </div>
              <button 
                onClick={() => setSelectedRoleForModal(null)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-8 max-h-[60vh] overflow-y-auto">
              <div className="space-y-6">
                {gapData.filter(d => d.job_role === selectedRoleForModal.title).length > 0 ? (
                  gapData.filter(d => d.job_role === selectedRoleForModal.title).map((req, i) => (
                    <div key={i} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{req.skill_name}</span>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Target: {req.required_proficiency}/5
                        </span>
                      </div>
                      <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                        {/* Required Bar */}
                        <div 
                          className="absolute inset-y-0 left-0 bg-slate-200" 
                          style={{ width: `${(req.required_proficiency / 5) * 100}%` }}
                        />
                        {/* Student Progress Bar */}
                        <div 
                          className={cn(
                            "absolute inset-y-0 left-0 transition-all duration-500",
                            req.gap <= 0 ? "bg-green-500" : "bg-blue-600"
                          )}
                          style={{ width: `${(req.student_proficiency / 5) * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs font-medium">
                        <span className={cn(req.student_proficiency >= req.required_proficiency ? "text-green-600" : "text-blue-600")}>
                          Your Level: {req.student_proficiency}
                        </span>
                        {req.gap > 0 && (
                          <span className="text-orange-500 flex items-center gap-1">
                            <AlertCircle size={12} /> Gap: {req.gap}
                          </span>
                        )}
                        {req.gap <= 0 && (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle2 size={12} /> Goal Met
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-slate-400">
                    <Briefcase size={48} className="mx-auto mb-4 opacity-20" />
                    <p>No specific skill requirements have been defined for this role yet.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setSelectedRoleForModal(null)}
                className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Roadmap Section */}
      <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Sparkles size={20} className="text-blue-600" />
              AI Preparation Roadmap
            </h3>
            <p className="text-sm text-slate-500 mt-1">Get a personalized study plan for your target career path.</p>
          </div>
          <div className="flex items-center gap-3">
            <select 
              value={selectedRoleForAI}
              onChange={(e) => setSelectedRoleForAI(e.target.value)}
              className="p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm min-w-[200px]"
            >
              <option value="">General Placement Prep</option>
              {jobRoles.map(r => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
            <button 
              onClick={handleGenerateRoadmap}
              disabled={aiLoading}
              className={cn(
                "px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2",
                aiLoading 
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                  : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200"
              )}
            >
              {aiLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              Generate Plan
            </button>
          </div>
        </div>

        {aiRoadmap ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100">
                <h4 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                  <Lightbulb size={18} />
                  Strategy Overview
                </h4>
                <p className="text-blue-800 text-sm leading-relaxed">{aiRoadmap.summary}</p>
              </div>
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <Briefcase size={18} />
                  Job Description
                </h4>
                <p className="text-slate-700 text-sm leading-relaxed">{aiRoadmap.jobDescription}</p>
              </div>
            </div>

            <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
              <h4 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
                <AlertCircle size={18} className="text-orange-500" />
                AI Skill Gap Analysis
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left pb-4 font-bold text-slate-500">Skill</th>
                      <th className="text-left pb-4 font-bold text-slate-500">Current</th>
                      <th className="text-left pb-4 font-bold text-slate-500">Required</th>
                      <th className="text-left pb-4 font-bold text-slate-500">Gap</th>
                      <th className="text-left pb-4 font-bold text-slate-500">Recommendation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {aiRoadmap.gaps.map((gap: any, i: number) => (
                      <tr key={i} className="group">
                        <td className="py-4 font-semibold text-slate-900">{gap.skill}</td>
                        <td className="py-4 text-slate-600">{gap.current}</td>
                        <td className="py-4 text-slate-600">{gap.required}</td>
                        <td className="py-4">
                          <span className="px-2 py-1 bg-orange-50 text-orange-600 rounded-lg text-xs font-bold">
                            {gap.gap}
                          </span>
                        </td>
                        <td className="py-4 text-slate-500 italic">{gap.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp size={18} className="text-green-600" />
                  Step-by-Step Guide
                </h4>
                <div className="space-y-4">
                  {aiRoadmap.steps.map((step: any, i: number) => (
                    <div key={i} className="relative pl-8 pb-4 border-l-2 border-slate-100 last:border-0 last:pb-0">
                      <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-blue-600 border-4 border-white shadow-sm" />
                      <p className="font-bold text-slate-900 text-sm">{step.title}</p>
                      <p className="text-slate-500 text-xs mt-1">{step.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="font-bold text-slate-900 flex items-center gap-2">
                    <BookOpen size={18} className="text-purple-600" />
                    Recommended Resources
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {aiRoadmap.resources.map((res: string, i: number) => (
                      <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-700 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                        {res}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-bold text-slate-900 flex items-center gap-2">
                    <Lightbulb size={18} className="text-yellow-500" />
                    Bridge the Gap: Project Ideas
                  </h4>
                  <div className="space-y-3">
                    {aiRoadmap.projects.map((project: any, i: number) => (
                      <div key={i} className="p-4 bg-yellow-50 rounded-xl border border-yellow-100">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-yellow-200 text-yellow-800 rounded">
                            {project.level}
                          </span>
                        </div>
                        <p className="font-bold text-slate-900 text-sm">{project.title}</p>
                        <p className="text-slate-600 text-xs mt-1">{project.description}</p>
                        <div className="mt-2 pt-2 border-t border-yellow-200/50">
                          <p className="text-[10px] font-bold text-yellow-700 uppercase">Skills Targeted:</p>
                          <p className="text-xs text-yellow-800 font-medium">{project.skillsLearned}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <Sparkles size={48} className="mx-auto mb-4 text-slate-200" />
            <p className="text-slate-500">Select a career path above to generate your personalized AI preparation roadmap.</p>
          </div>
        )}
      </div>

      {/* Recommendations & Resources */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Peer Comparison */}
        {peerComparison.length > 0 && (
          <div className="lg:col-span-1 bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Users size={20} className="text-blue-600" />
              Peer Comparison
            </h3>
            <div className="space-y-6">
              {Array.isArray(peerComparison) && peerComparison.map((comp, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-slate-700">{comp.skill_name}</span>
                    <span className="text-slate-500">You vs Peers</span>
                  </div>
                  <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                    {/* Peer Avg */}
                    <div 
                      className="absolute top-0 left-0 h-full bg-slate-300 opacity-50" 
                      style={{ width: `${(comp.avg_peer_proficiency / 5) * 100}%` }}
                    />
                    {/* User Proficiency */}
                    <div 
                      className={cn(
                        "absolute top-0 left-0 h-full transition-all duration-500",
                        (comp.user_proficiency || 0) >= comp.avg_peer_proficiency ? "bg-green-500" : "bg-orange-500"
                      )}
                      style={{ width: `${((comp.user_proficiency || 0) / 5) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                    <span className={(comp.user_proficiency || 0) >= comp.avg_peer_proficiency ? "text-green-600" : "text-orange-600"}>
                      Your Level: {comp.user_proficiency || 0}
                    </span>
                    <span className="text-slate-400">Peer Avg: {comp.avg_peer_proficiency?.toFixed(1) || 0}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-xs text-slate-400 italic">
              Comparison based on other students targeting the same role.
            </p>
          </div>
        )}

        <div className={cn("space-y-8", peerComparison.length > 0 ? "lg:col-span-2" : "lg:col-span-3")}>
          {/* Personalized Recommendations */}
          <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Lightbulb size={20} className="text-yellow-500" />
              Skill Gap Recommendations
            </h3>
            <div className="space-y-4">
              {Array.isArray(recommendations) && recommendations.length > 0 ? recommendations.map((rec, i) => (
                <div key={i} className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center text-blue-600 shadow-sm shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">{rec.skill_name}</p>
                    <p className="text-xs text-slate-500 mb-2">Required for {rec.job_role}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-600" 
                          style={{ width: `${(rec.student_proficiency / rec.required_proficiency) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-600">Gap: {rec.gap}</span>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="text-center py-8 text-slate-500">
                  No major skill gaps identified! You're on the right track.
                </div>
              )}
            </div>
          </div>

          {/* Recommended Resources */}
          <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <BookOpen size={20} className="text-purple-600" />
                Learning Resources
              </h3>
              <span className="text-xs font-bold px-2 py-1 bg-purple-50 text-purple-600 rounded-lg">
                {completedResources.length} / {recommendedResources.length} Done
              </span>
            </div>
            <div className="space-y-4">
              {Array.isArray(recommendedResources) && recommendedResources.length > 0 ? recommendedResources.slice(0, 8).map((res, i) => (
                <div 
                  key={i} 
                  className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between hover:bg-white hover:shadow-md transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                      completedResources.includes(res.id) ? "bg-green-100 text-green-600" : "bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white"
                    )}>
                      {completedResources.includes(res.id) ? <CheckCircle2 size={16} /> : <BookOpen size={16} />}
                    </div>
                    <div>
                      <a href={res.url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-slate-900 hover:text-purple-600 transition-colors block">{res.title}</a>
                      <p className="text-xs text-slate-500 capitalize">{res.type}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleToggleResource(res.id)}
                    disabled={completedResources.includes(res.id)}
                    className={cn(
                      "p-1.5 rounded-lg transition-all",
                      completedResources.includes(res.id) ? "text-green-600" : "text-slate-300 hover:text-green-600 hover:bg-green-50"
                    )}
                  >
                    <CheckCircle2 size={18} />
                  </button>
                </div>
              )) : (
                <div className="text-center py-8 text-slate-500">
                  Update your skills to see recommended learning resources.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
