import { useRef, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';

import { useFlywheelPort } from '@/entities/flywheel';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';

import { validateCollectionSetup, type CollectionSetupErrors } from './collection-setup-validation';

function defaultSessionName(): string {
  const date = new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  return `휴머노이드 수집 ${date}`;
}

export interface CollectionSetupContext {
  readonly restoreCreateFocus: () => void;
}

export function NewHumanoidCollectionPage() {
  const port = useFlywheelPort();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const context = useOutletContext<CollectionSetupContext | undefined>();
  const [fields, setFields] = useState(() => ({
    name: defaultSessionName(),
    taskId: '',
    instruction: '',
    exoskeletonDeviceId: '',
    questDeviceId: '',
    headCameraDeviceId: '',
    externalCameraDeviceId: '',
  }));
  const [fieldErrors, setFieldErrors] = useState<CollectionSetupErrors>({});
  const [pending, setPending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(true);
  const nextPathRef = useRef('/mlops/collection');
  const [error, setError] = useState<string | null>(null);
  const submissionRef = useRef(false);
  const createdRef = useRef(false);
  const updateField = (key: keyof typeof fields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };
  const inputProps = (key: Exclude<keyof typeof fields, 'instruction'>) => ({
    name: key,
    value: fields[key],
    disabled: pending,
    required: key !== 'externalCameraDeviceId',
    ...(fieldErrors[key] ? { error: fieldErrors[key] } : {}),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => updateField(key, event.target.value),
  });

  return (
    <Dialog
      open={dialogOpen}
      title="새 데이터 수집"
      cancelLabel="취소"
      cancelDisabled={pending}
      onOpenChange={(open) => {
        if (!open && !submissionRef.current) {
          setDialogOpen(false);
        }
      }}
      onAfterClose={() => {
        void navigate({ pathname: nextPathRef.current, search: params.toString() }, { replace: true });
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (!createdRef.current) context?.restoreCreateFocus();
      }}
      actions={<Button form="new-collection-form" type="submit" isLoading={pending}>세션 생성</Button>}
    >
      <form
        id="new-collection-form"
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (submissionRef.current) return;
          const errors = validateCollectionSetup(fields);
          setFieldErrors(errors);
          if (Object.keys(errors).length > 0) {
            event.currentTarget.querySelector<HTMLElement>(`[name="${Object.keys(errors)[0]}"]`)?.focus();
            return;
          }
          submissionRef.current = true;
          setPending(true);
          setError(null);
          void port.createHumanDemonstrationSession({
            projectId: 'project-tiger',
            siteId: 'site-lab',
            name: fields.name.trim(),
            taskId: fields.taskId.trim(),
            instruction: fields.instruction.trim(),
            exoskeletonDeviceId: fields.exoskeletonDeviceId.trim(),
            questDeviceId: fields.questDeviceId.trim(),
            headCameraDeviceId: fields.headCameraDeviceId.trim(),
            externalCameraDeviceId: fields.externalCameraDeviceId.trim(),
            profileId: 'human-demo-quest-hand-v1',
          }).then((session) => {
            createdRef.current = true;
            nextPathRef.current = `/mlops/collection/${encodeURIComponent(session.id)}/setup`;
            setDialogOpen(false);
          }).catch(() => {
            setError('세션을 생성하지 못했습니다. 연결 상태를 확인하고 다시 시도하세요.');
            setPending(false);
            submissionRef.current = false;
          });
        }}
      >
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="세션 이름" {...inputProps('name')} />
            <Input label="작업 ID" {...inputProps('taskId')} />
          </div>
          <Textarea label="작업 지시" name="instruction" rows={2} required disabled={pending}
            value={fields.instruction}
            onChange={(event) => updateField('instruction', event.target.value)}
            aria-invalid={fieldErrors.instruction ? true : undefined}
            aria-describedby={fieldErrors.instruction ? 'collection-instruction-error' : undefined}
          />
          {fieldErrors.instruction ? <p className="text-sm text-negative" id="collection-instruction-error">{fieldErrors.instruction}</p> : null}
        </div>
        <fieldset className="min-w-0 border-t border-border pt-4">
          <legend className="pr-2 text-sm font-semibold">수집 장치</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="외골격 장치 ID" {...inputProps('exoskeletonDeviceId')} />
            <Input label="Quest 손 추적 장치 ID" {...inputProps('questDeviceId')} />
            <Input label="RBP 헤드 카메라 ID" {...inputProps('headCameraDeviceId')} />
            <Input label="외부 카메라 ID · 선택" {...inputProps('externalCameraDeviceId')} />
          </div>
        </fieldset>
        <p className="text-xs text-muted">세션을 생성하면 장치 연결로 이어집니다.</p>
        {error ? <p className="text-sm text-negative" role="alert">{error}</p> : null}
      </form>
    </Dialog>
  );
}
