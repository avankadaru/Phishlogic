import { cn } from '@/lib/utils';

interface Scenario {
  id: string;
  label: string;
  category: 'safe' | 'suspicious' | 'malicious';
  description: string;
}

interface Props {
  scenarios: Scenario[];
  selectedId: string | null;
  onSelect: (scenario: Scenario) => void;
}

export function ScenarioButtons({ scenarios, selectedId, onSelect }: Props) {
  const grouped = {
    safe: scenarios.filter(s => s.category === 'safe'),
    suspicious: scenarios.filter(s => s.category === 'suspicious'),
    malicious: scenarios.filter(s => s.category === 'malicious'),
  };

  const categoryLabels = {
    safe: 'Safe',
    suspicious: 'Suspicious',
    malicious: 'Malicious',
  };

  const categoryColors = {
    safe: 'text-green-600 dark:text-green-400',
    suspicious: 'text-yellow-600 dark:text-yellow-400',
    malicious: 'text-red-600 dark:text-red-400',
  };

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <h3 className={cn(
            'text-sm font-medium mb-2',
            categoryColors[category as keyof typeof categoryColors]
          )}>
            {categoryLabels[category as keyof typeof categoryLabels]} ({items.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {items.map((scenario) => (
              <button
                key={scenario.id}
                onClick={() => onSelect(scenario)}
                className={cn(
                  'px-3 py-1.5 text-sm rounded-md border transition-colors',
                  selectedId === scenario.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                )}
                title={scenario.description}
              >
                {scenario.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
