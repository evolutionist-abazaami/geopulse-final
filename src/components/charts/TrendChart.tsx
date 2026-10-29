import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface TrendChartProps {
  data: Array<{ date: string; value: number | null; label?: string }>;
  title: string;
  color?: string;
  showLegend?: boolean;
}

export const TrendChart = ({ data, title, color = "hsl(var(--primary))", showLegend = true }: TrendChartProps) => {
  const chartConfig = {
    value: {
      label: title,
      color: color,
    },
  };

  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium mb-4">{title}</h3>
      <ChartContainer config={chartConfig} className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="date" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            {showLegend && <Legend />}
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke={color}
              strokeWidth={2}
              dot={{ fill: color, r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
    </Card>
  );
};
