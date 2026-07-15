'use client';

import { IMPORT_TEMPLATE_HEADERS, type ImportResult } from '@cch/shared';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, Switch } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/states';
import { useImportStudents } from '@/hooks/use-admin';
import { API_URL } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * The bulk import.
 *
 * The flow is deliberately two-step: a DRY RUN always runs first, and the real
 * import button does not appear until it has. An admin about to touch 1,400
 * accounts should see exactly what will happen before it happens — and if the
 * file is bad, they find out having changed nothing.
 *
 * The server enforces this too: it validates every row before writing any row,
 * and rejects the whole file if any row fails. A half-applied import is the worst
 * outcome available, because nobody can then tell which students exist.
 */
export default function ImportStudentsPage() {
  const router = useRouter();
  const importStudents = useImportStudents();

  const [file, setFile] = React.useState<File | null>(null);
  const [updateExisting, setUpdateExisting] = React.useState(true);
  const [preview, setPreview] = React.useState<ImportResult | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement>(null);

  const pick = (f: File | null) => {
    setFile(f);
    // Any new file invalidates the previous preview — showing a stale one next to
    // a different file is how an admin ends up importing something they did not
    // look at.
    setPreview(null);
  };

  const runDryRun = () => {
    if (!file) return;
    importStudents.mutate(
      { file, dryRun: true, updateExisting },
      { onSuccess: setPreview },
    );
  };

  const runImport = () => {
    if (!file) return;
    importStudents.mutate(
      { file, dryRun: false, updateExisting },
      {
        onSuccess(result) {
          if (result.failed === 0) router.push('/admin/students');
          else setPreview(result);
        },
      },
    );
  };

  const hasErrors = Boolean(preview && preview.failed > 0);
  const canImport = Boolean(preview && preview.failed === 0);

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link href="/admin/students">
          <ArrowLeft className="h-4 w-4" />
          Back to students
        </Link>
      </Button>

      <PageHeader
        title="Import students"
        description="Upload the student roll as a CSV or Excel file. Existing students are matched by USN and updated, never duplicated."
      />

      <div className="space-y-6">
        {/* ── Template ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Get the format right</CardTitle>
            <CardDescription>
              These columns are required. Common aliases are accepted too — “Reg No” works for USN,
              “Branch” works for Department.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {IMPORT_TEMPLATE_HEADERS.map((h) => (
                <Badge key={h} variant="outline" className="font-mono">
                  {h}
                </Badge>
              ))}
            </div>

            <Button variant="outline" size="sm" asChild>
              {/* A plain anchor, not fetch — the browser handles the file download
                  natively, and the auth cookie rides along with it. */}
              <a href={`${API_URL}/admin/students/import/template`} download>
                <Download className="h-4 w-4" />
                Download template
              </a>
            </Button>

            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Every student&rsquo;s first password is their USN.</p>
              <p className="mt-0.5">
                They are locked out of everything until they replace it at first sign-in — so a USN
                that leaks is not a usable account.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Upload ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Upload the file</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) pick(dropped);
              }}
              className={cn(
                'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors',
                dragging ? 'border-primary bg-primary/5' : 'border-border',
              )}
            >
              {file ? (
                <>
                  <FileSpreadsheet className="mb-3 h-8 w-8 text-primary" />
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                  <Button variant="ghost" size="sm" className="mt-3" onClick={() => pick(null)}>
                    <X className="h-4 w-4" />
                    Remove
                  </Button>
                </>
              ) : (
                <>
                  <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Drop your .csv or .xlsx here</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">or</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => inputRef.current?.click()}
                  >
                    Choose a file
                  </Button>
                </>
              )}

              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="sr-only"
                onChange={(e) => pick(e.target.files?.[0] ?? null)}
              />
            </div>

            <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border p-3">
              <div>
                <Label className="cursor-pointer">Update students who already exist</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Matched by USN. Their name, email, department and year are refreshed.{' '}
                  <strong>Passwords are never touched</strong> — a student who already chose one
                  keeps it.
                </p>
              </div>
              <Switch
                checked={updateExisting}
                onCheckedChange={(v) => {
                  setUpdateExisting(v);
                  setPreview(null);
                }}
              />
            </label>

            <Button
              onClick={runDryRun}
              disabled={!file}
              loading={importStudents.isPending && !preview}
              className="w-full"
            >
              Check the file
            </Button>
          </CardContent>
        </Card>

        {/* ── Preview ─────────────────────────────────────────────────── */}
        {preview ? (
          <Card
            className={cn(
              hasErrors ? 'border-destructive/40' : 'border-success/40',
            )}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {hasErrors ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    {preview.failed} row{preview.failed === 1 ? '' : 's'} need fixing
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    Ready to import
                  </>
                )}
              </CardTitle>

              <CardDescription>
                {hasErrors
                  ? 'Nothing has been written. Fix these rows in your spreadsheet and upload it again — the import is all-or-nothing, so a half-applied file can never leave you guessing which students exist.'
                  : `${preview.totalRows} rows checked. Nothing has been written yet.`}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Create" value={preview.created} tone="success" />
                <Stat label="Update" value={preview.updated} tone="default" />
                <Stat label="Failed" value={preview.failed} tone={hasErrors ? 'destructive' : 'muted'} />
              </div>

              {preview.unknownDepartments.length > 0 ? (
                <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
                  <p className="font-medium">
                    Unknown department code{preview.unknownDepartments.length === 1 ? '' : 's'}:{' '}
                    {preview.unknownDepartments.join(', ')}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Create the department first, or correct the code in your file.
                  </p>
                </div>
              ) : null}

              {preview.errors.length > 0 ? (
                <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/80 text-left backdrop-blur">
                      <tr>
                        <th className="px-3 py-2 font-medium">Row</th>
                        <th className="px-3 py-2 font-medium">USN</th>
                        <th className="px-3 py-2 font-medium">Problem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.errors.map((e) => (
                        <tr key={`${e.row}`} className="border-t border-border">
                          {/* The row number matches what they see in Excel, header
                              included — otherwise the report is useless. */}
                          <td className="px-3 py-2 font-mono">{e.row}</td>
                          <td className="px-3 py-2 font-mono">{e.usn ?? '—'}</td>
                          <td className="px-3 py-2 text-destructive">{e.errors.join('; ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {canImport ? (
                <Button
                  onClick={runImport}
                  loading={importStudents.isPending}
                  className="w-full"
                  size="lg"
                >
                  Import {preview.created + preview.updated} student
                  {preview.created + preview.updated === 1 ? '' : 's'}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'destructive' | 'default' | 'muted';
}) {
  const toneClass = {
    success: 'text-success',
    destructive: 'text-destructive',
    default: 'text-foreground',
    muted: 'text-muted-foreground',
  }[tone];

  return (
    <div className="rounded-lg border border-border p-3 text-center">
      <div className={cn('text-2xl font-semibold tabular-nums', toneClass)}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
