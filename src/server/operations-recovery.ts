import { getPool } from "@/db";

const RECOVERY_BATCH = 100;

export async function reconcileOperationalRecovery() {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const jobs = await client.query<{ id: string }>(
      `select id from ai_jobs
        where status = 'running' and lease_expires_at < now()
        order by lease_expires_at, id
        for update skip locked
        limit ${RECOVERY_BATCH}`,
    );
    const jobIds = jobs.rows.map((row) => row.id);
    if (jobIds.length) {
      await client.query(
        `update managed_usage_records u
            set state = 'released', units_consumed = 0, settled_at = now(), updated_at = now()
          where state = 'reserved' and id in (
            select managed_usage_record_id from ai_job_attempts
             where job_id = any($1::uuid[]) and managed_usage_record_id is not null
          )`,
        [jobIds],
      );
      await client.query(
        `update ai_job_attempts
            set status = 'failed', error_code = 'ai_lease_expired', error_message = null,
                completed_at = now()
          where job_id = any($1::uuid[]) and status = 'running'`,
        [jobIds],
      );
      await client.query(
        `update ai_jobs
            set status = 'failed', error_code = 'ai_lease_expired', error_message = null,
                lease_owner = null, lease_expires_at = null,
                completed_at = now(), updated_at = now()
          where id = any($1::uuid[]) and status = 'running' and lease_expires_at < now()`,
        [jobIds],
      );
    }
    const released = await client.query(
      `with candidates as (
         select id from managed_usage_records u
          where state = 'reserved' and source_type = 'ai_job'
            and updated_at < now() - interval '15 minutes'
            and not exists (
              select 1 from ai_jobs j
               where j.id::text = u.source_id and j.status in ('queued', 'running')
            )
          order by updated_at, id
          for update skip locked
          limit ${RECOVERY_BATCH}
       )
       update managed_usage_records u
          set state = 'released', units_consumed = 0, settled_at = now(), updated_at = now()
         from candidates c where u.id = c.id
       returning u.id`,
    );
    const rateLimits = await client.query(
      `delete from action_rate_limits where ctid in (
         select ctid from action_rate_limits where expires_at < now()
          order by expires_at limit 1000
       ) returning key`,
    );
    await client.query("commit");
    return {
      expiredAiJobsRecovered: jobIds.length,
      orphanReservationsReleased: released.rowCount ?? 0,
      expiredRateLimitsRemoved: rateLimits.rowCount ?? 0,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
