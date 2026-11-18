-- Task.status was never written, so every task read PENDING. Work it out once from each task's assignments, with the
-- same rule the API now applies on every change: approved once all are approved; submitted while any awaits review;
-- rework while any was sent back; in progress once anyone started or some are approved; otherwise pending.
UPDATE "Task" AS t
SET "status" = s."status"
FROM (
  SELECT ta."taskId" AS "id",
    (CASE
      WHEN bool_and(ta."status" = 'APPROVED') THEN 'APPROVED'
      WHEN bool_or(ta."status" = 'SUBMITTED') THEN 'SUBMITTED'
      WHEN bool_or(ta."status" = 'REWORK') THEN 'REWORK'
      WHEN bool_or(ta."status" IN ('IN_PROGRESS', 'APPROVED')) THEN 'IN_PROGRESS'
      ELSE 'PENDING'
    END)::"TaskStatus" AS "status"
  FROM "TaskAssignment" AS ta
  GROUP BY ta."taskId"
) AS s
WHERE t."id" = s."id";
