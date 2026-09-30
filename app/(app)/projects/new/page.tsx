import { NewProjectForm } from "../../../../components/NewProjectForm";

export const metadata = { title: "New project" };

export default function NewProjectPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">New project</div>
          <h2>Set up a board for your team.</h2>
          <p>
            Every project starts with Backlog, In Progress, In Review and Done — rename or
            extend them once you are inside.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 760 }}>
        <NewProjectForm />
      </div>
    </>
  );
}