import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Layers, GitCompare, Brain, TreeDeciduous, BarChart3 } from "lucide-react";

export type ClassificationType = 
  | 'unsupervised_kmeans' 
  | 'unsupervised_isodata' 
  | 'supervised_ml' 
  | 'supervised_rf' 
  | 'supervised_svm' 
  | null;

interface ClassificationControlsProps {
  classificationType: ClassificationType;
  onClassificationTypeChange: (type: ClassificationType) => void;
  enableChangeDetection: boolean;
  onChangeDetectionToggle: (enabled: boolean) => void;
  numClasses: number;
  onNumClassesChange: (num: number) => void;
}

const classificationMethods = [
  { 
    value: 'unsupervised_kmeans', 
    label: 'K-Means Clustering', 
    category: 'Unsupervised',
    description: 'Partitions pixels into k clusters based on spectral similarity'
  },
  { 
    value: 'unsupervised_isodata', 
    label: 'ISODATA', 
    category: 'Unsupervised',
    description: 'Iterative self-organizing with automatic class splitting/merging'
  },
  { 
    value: 'supervised_ml', 
    label: 'Maximum Likelihood', 
    category: 'Supervised',
    description: 'Statistical classification assuming Gaussian distribution'
  },
  { 
    value: 'supervised_rf', 
    label: 'Random Forest', 
    category: 'Supervised',
    description: 'Ensemble of decision trees for robust classification'
  },
  { 
    value: 'supervised_svm', 
    label: 'Support Vector Machine', 
    category: 'Supervised',
    description: 'Optimal hyperplane classification for complex boundaries'
  },
];

const ClassificationControls = ({
  classificationType,
  onClassificationTypeChange,
  enableChangeDetection,
  onChangeDetectionToggle,
  numClasses,
  onNumClassesChange,
}: ClassificationControlsProps) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const selectedMethod = classificationMethods.find(m => m.value === classificationType);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between px-0 hover:bg-transparent">
          <span className="flex items-center gap-2 font-bold text-base">
            <Brain className="h-4 w-4 text-primary" />
            Advanced Analysis
          </span>
          <div className="flex items-center gap-2">
            {(classificationType || enableChangeDetection) && (
              <Badge variant="secondary" className="text-xs">
                {[classificationType && 'Classification', enableChangeDetection && 'Change Detection'].filter(Boolean).join(' + ')}
              </Badge>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="pt-3 space-y-4">
        {/* Classification Method */}
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <Label className="font-medium">Land Cover Classification</Label>
          </div>
          
          <Select 
            value={classificationType || 'none'} 
            onValueChange={(v) => onClassificationTypeChange(v === 'none' ? null : v as ClassificationType)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select classification method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">No classification</span>
              </SelectItem>
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground border-t border-b my-1">
                Unsupervised Methods
              </div>
              {classificationMethods.filter(m => m.category === 'Unsupervised').map((method) => (
                <SelectItem key={method.value} value={method.value}>
                  <div className="flex flex-col">
                    <span>{method.label}</span>
                  </div>
                </SelectItem>
              ))}
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground border-t border-b my-1">
                Supervised Methods
              </div>
              {classificationMethods.filter(m => m.category === 'Supervised').map((method) => (
                <SelectItem key={method.value} value={method.value}>
                  <div className="flex flex-col">
                    <span>{method.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {selectedMethod && (
            <p className="text-xs text-muted-foreground">{selectedMethod.description}</p>
          )}
          
          {classificationType && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Number of Classes</Label>
                <Badge variant="outline">{numClasses}</Badge>
              </div>
              <Slider
                value={[numClasses]}
                onValueChange={(v) => onNumClassesChange(v[0])}
                min={2}
                max={15}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>2 (simple)</span>
                <span>15 (detailed)</span>
              </div>
            </div>
          )}
        </Card>

        {/* Change Detection */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitCompare className="h-4 w-4 text-primary" />
              <Label className="font-medium">Change Detection</Label>
            </div>
            <Switch
              checked={enableChangeDetection}
              onCheckedChange={onChangeDetectionToggle}
            />
          </div>
          
          {enableChangeDetection && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Compares Sentinel-2 imagery between start and end dates to identify and quantify land cover changes.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs">
                  <TreeDeciduous className="h-3 w-3 mr-1" />
                  Image Differencing
                </Badge>
                <Badge variant="outline" className="text-xs">
                  <BarChart3 className="h-3 w-3 mr-1" />
                  Change Matrix
                </Badge>
              </div>
            </div>
          )}
        </Card>

        {/* Sentinel-2 Band Info */}
        <div className="p-3 bg-muted/30 rounded-lg space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Sentinel-2 MSI Bands Used:</p>
          <div className="flex flex-wrap gap-1">
            {[
              { band: 'B02', name: 'Blue' },
              { band: 'B03', name: 'Green' },
              { band: 'B04', name: 'Red' },
              { band: 'B08', name: 'NIR' },
              { band: 'B11', name: 'SWIR1' },
              { band: 'B12', name: 'SWIR2' },
            ].map(({ band, name }) => (
              <Badge key={band} variant="secondary" className="text-xs">
                {band} ({name})
              </Badge>
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default ClassificationControls;
