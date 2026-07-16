'use client';

import type { ParsedJob } from '@cch/shared';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { JobForm } from '@/components/admin/job-form';
import { WhatsAppPaste } from '@/components/admin/whatsapp-paste';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/states';
import { useParseJob } from '@/hooks/use-admin';

export default function NewJobPage() {
  // Parsed WhatsApp data flows from the paste box into the form as a seed.
  const [prefill, setPrefill] = React.useState<ParsedJob | null>(null);
  const parse = useParseJob();

  /**
   * When the admin arrived here via "Use in new opportunity" from a student
   * report, the report's message is waiting in sessionStorage. Parse it once and
   * seed the form, then clear it so a refresh does not re-import.
   */
  React.useEffect(() => {
    let text: string | null = null;
    try {
      text = sessionStorage.getItem('cch:report-prefill');
      if (text) sessionStorage.removeItem('cch:report-prefill');
    } catch {
      /* private mode */
    }
    if (text) parse.mutate(text, { onSuccess: setPrefill });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
        <Link href="/admin/jobs">
          <ArrowLeft className="h-4 w-4" />
          Back to opportunities
        </Link>
      </Button>

      <PageHeader
        title="New opportunity"
        description="Paste a WhatsApp message to pre-fill, or fill it in by hand. It stays invisible to students until you set the status to Published."
      />

      <WhatsAppPaste onParsed={setPrefill} />

      <JobForm prefill={prefill} />
    </div>
  );
}
