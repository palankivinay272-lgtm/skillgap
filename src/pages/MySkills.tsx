import React, { useState, useEffect } from 'react';
import { Plus, Star, TrendingUp, Search, Filter, Trash2, Award } from 'lucide-react';
import { cn } from '../lib/utils';
import { db, auth } from '../firebase';
import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';

export default function MySkills() {
  const [skills, setSkills] = useState<any[]>([]);
  const [allSkills, setAllSkills] = useState<any[]>([]);
  const [selectedSkill, setSelectedSkill] = useState('');
  const [proficiency, setProficiency] = useState(3);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');

  const fetchData = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      // 1. Fetch all skills
      const allSkillsSnap = await getDocs(collection(db, 'skills'));
      const allSkillsData = allSkillsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setAllSkills(allSkillsData);

      // 2. Fetch student's skills
      const studentSkillsSnap = await getDocs(collection(db, 'users', user.uid, 'skills'));
      const studentSkillsData = studentSkillsSnap.docs.map(doc => {
        const skillInfo = allSkillsData.find(s => s.id === doc.id);
        return {
          id: doc.id,
          name: skillInfo?.name || 'Unknown',
          category: skillInfo?.category || 'General',
          proficiency: doc.data().proficiency
        };
      });
      setSkills(studentSkillsData);
    } catch (err) {
      console.error("Error fetching skills:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdateSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!selectedSkill || !user) return;

    try {
      await setDoc(doc(db, 'users', user.uid, 'skills', selectedSkill), {
        proficiency: proficiency
      });
      setSelectedSkill('');
      setProficiency(3);
      fetchData();
    } catch (err) {
      console.error("Error updating skill:", err);
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      await deleteDoc(doc(db, 'users', user.uid, 'skills', skillId));
      fetchData();
    } catch (err) {
      console.error("Error deleting skill:", err);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]">Loading...</div>;

  const categories = ['All', ...Array.from(new Set(allSkills.map(s => s.category)))];
  
  const mySkills = skills.filter(s => s.proficiency);
  const filteredSkills = mySkills.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'All' || s.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Update Form */}
        <div className="lg:col-span-1">
          <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm sticky top-24">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <TrendingUp size={20} className="text-blue-600" />
              Add or Update Skill
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
                  {allSkills.map(s => (
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
                disabled={!selectedSkill}
                className={cn(
                  "w-full font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2",
                  selectedSkill 
                    ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200" 
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                )}
              >
                <Plus size={20} />
                Save Skill
              </button>
            </form>
          </div>
        </div>

        {/* Skills List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder="Search your skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-slate-400" />
              <select 
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredSkills.length > 0 ? filteredSkills.map((skill) => (
              <div key={skill.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                    <Award size={24} />
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star 
                        key={star} 
                        size={14} 
                        className={cn(
                          star <= skill.proficiency ? "fill-yellow-400 text-yellow-400" : "text-slate-200"
                        )} 
                      />
                    ))}
                  </div>
                </div>
                <h4 className="font-bold text-slate-900 text-lg">{skill.name}</h4>
                <p className="text-sm text-slate-500 mb-4">{skill.category}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-lg">
                    Level {skill.proficiency}
                  </span>
                  <button 
                    onClick={() => handleDeleteSkill(skill.id)}
                    className="text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            )) : (
              <div className="col-span-full text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
                <Award size={48} className="mx-auto mb-4 text-slate-200" />
                <p className="text-slate-500">No skills found matching your criteria.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
