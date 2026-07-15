'use client';

import type { ParsedJob } from '@cch/shared';
import { MessageSquareText, Sparkles, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useParseJob } from '@/hooks/use-admin';

/**
 * Paste a forwarded WhatsApp message, extract what we can, and hand it to the
 * form below as a starting point.
 *
 * This is explicitly a HEAD START, not magic: the extraction is heuristic and
 * will miss things, so the copy promises "a starting point" and the real work
 * still happens in the editable form. Nothing is published from here.
 */
const FIELD_LABELS: Record<string, string> = {
  companyName: 'Company',
  role: 'Role',
  eligibility: 'Eligibility',
  salaryText: 'Salary',
  location: 'Location',
  mode: 'Mode',
  deadline: 'Deadline',
  applicationLink: 'Link',
  tags: 'Tags',
};

export function WhatsAppPaste({ onParsed }: { onParsed: (parsed: ParsedJob) => void }) {
  const [text, setText] = React.useState('');
  const [detected, setDetected] = React.useState<string[] | null>(null);
  const parse = useParseJob();

  const handleExtract = () => {
    if (!text.trim()) return;
    parse.mutate(text, {
      onSuccess(parsed) {
        setDetected(parsed.detected);
        onParsed(parsed);
      },
    });
  };

  return (
    <Card className="mb-6 border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareText className="h-4 w-4 text-primary" />
          Paste a WhatsApp message
        </CardTitle>
        <CardDescription>
          Drop in the forwarded placement message and we&rsquo;ll pre-fill the form below. Always
          review it — extraction is a starting point, not the final word.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="relative">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              '*Software Engineer at Google*\nEligibility: 2026 batch, 7+ CGPA\nPackage: 24 LPA\nLast date: 25/12/2026\nApply: https://…'
            }
            rows={7}
            className="resize-y font-mono text-xs"
            aria-label="WhatsApp message"
          />
          {text ? (
            <button
              type="button"
              onClick={() => {
                setText('');
                setDetected(null);
              }}
              className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          {detected && detected.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Filled:</span>
              {detected.map((f) => (
                <Badge key={f} variant="success">
                  {FIELD_LABELS[f] ?? f}
                </Badge>
              ))}
            </div>
          ) : detected ? (
            <span className="text-xs text-muted-foreground">
              Couldn&rsquo;t detect fields — fill the form in manually below.
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              We&rsquo;ll extract the link, deadline, salary and more.
            </span>
          )}

          <Button
            type="button"
            onClick={handleExtract}
            loading={parse.isPending}
            disabled={!text.trim()}
            className="shrink-0"
          >
            <Sparkles className="h-4 w-4" />
            Extract details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
