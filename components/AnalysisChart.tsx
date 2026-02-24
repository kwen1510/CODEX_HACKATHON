
import React from 'react';
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer 
} from 'recharts';

interface AnalysisChartProps {
  scores: {
    coherence: number;
    cohesiveness: number;
    empathyTone: number;
    empathyPhrasing: number;
    novelty: number;
  };
}

const AnalysisChart: React.FC<AnalysisChartProps> = ({ scores }) => {
  const data = [
    { subject: 'Flow Coherence', A: scores.coherence, fullMark: 100 },
    { subject: 'Goal Cohesion', A: scores.cohesiveness, fullMark: 100 },
    { subject: 'Tone Empathy', A: scores.empathyTone, fullMark: 100 },
    { subject: 'Phrasing Empathy', A: scores.empathyPhrasing, fullMark: 100 },
    { subject: 'Novelty', A: scores.novelty, fullMark: 100 },
  ];

  return (
    <div className="h-64 w-full bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">Metrics Overview</h3>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#6b7280' }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="Research Audit"
            dataKey="A"
            stroke="#4f46e5"
            fill="#4f46e5"
            fillOpacity={0.5}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AnalysisChart;
