CREATE TABLE execution_stream_events (
 execution_task_id text NOT NULL REFERENCES execution_tasks(id),
 sequence integer NOT NULL CHECK(sequence > 0),
 call_id text NOT NULL REFERENCES execution_calls(id),
 call_index integer NOT NULL CHECK(call_index >= 0),
 chunk jsonb NOT NULL,
 created_at text NOT NULL,
 PRIMARY KEY(execution_task_id,sequence)
);
--> statement-breakpoint
CREATE UNIQUE INDEX execution_stream_call_index_unique ON execution_stream_events(call_id,call_index);
