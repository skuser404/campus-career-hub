'use client';

import { reportInputSchema, type ReportInput } from '@cch/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Megaphone, Send } from 'lucide-react';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/primitives';
import { useDepartments, useSubmitReport } from '@/hooks/use-reports';

const NONE = '__none__';

/**
 * "Report a missing opportunity."
 *
 * A student pastes a placement message their department received that is not on
 * the site. It goes to the admin's review queue — never straight to other
 * students — so the raw, unvetted text is only ever seen by the admin.
 */
export function ReportDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const { data: departments } = useDepartments();
  const submit = useSubmitReport();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ReportInput>({
    resolver: zodResolver(reportInputSchema),
    defaultValues: { message: '', companyName: '', departmentId: null },
  });

  const onSubmit = (data: ReportInput) => {
    submit.mutate(data, {
      onSuccess: () => {
        reset();
        setOpen(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Megaphone className="h-4 w-4" />
            Report Missing Opportunity
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Report a missing opportunity</DialogTitle>
          <DialogDescription>
            Paste the official WhatsApp placement message. The placement office reviews it and
            publishes it so every eligible student can see it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="report-dept">Department</Label>
              <Controller
                name="departmentId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                  >
                    <SelectTrigger id="report-dept">
                      <SelectValue placeholder="Which department?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not sure</SelectItem>
                      {departments?.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.code} — {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="report-company">Company (optional)</Label>
              <Input id="report-company" placeholder="e.g. Infosys" {...register('companyName')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="report-message">Placement message</Label>
            <Textarea
              id="report-message"
              rows={7}
              placeholder="Paste the full WhatsApp message here…"
              error={Boolean(errors.message)}
              {...register('message')}
            />
            {errors.message ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.message.message}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submit.isPending}>
              <Send className="h-4 w-4" />
              Send to placement office
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
