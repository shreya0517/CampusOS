import { isOverdue, type TaskStatus } from '@/lib/tasks-api';

/** A task's deadline, marked Overdue once it has passed and the work isn't approved. */
export function TaskDeadline({ deadline, status, withTime = false }: { deadline: string; status: TaskStatus; withTime?: boolean }) {
  const date = new Date(deadline);
  return (
    <>
      {withTime ? date.toLocaleString('en-IN') : date.toLocaleDateString('en-IN')}
      {isOverdue(deadline, status) && (
        <span className="ml-2 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Overdue</span>
      )}
    </>
  );
}
