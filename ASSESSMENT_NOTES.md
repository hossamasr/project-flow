- ### How is the application structured, and what are the major modules?

  ans:

  1- The application has two main parts:

  - Backend with NestJS
  - Frontend with Next.js
  - I see the app in domain-driven design as api organized like
  - - auth and user ID
    - org and memberships
    - projects and project management
    - tasks
    - comments
  - I also noticed the frontend has one API client and some wrappers. I noticed the pattern of architecture in the backend: auth or project has DTO or schema, then module, service, controller
    PS: not my main stack, but nothing new under the sun ^_^

  ### Where business logic lives

  - **Ans**: In the backend, especially in the service part across all modules. The service layer does most of the work; controllers just route the work across different services

  ### How does the frontend talk to the backend, and how is server state handled?

  ans :

  1- The web frontend talks to the API through a wrapper in api-client.ts. It adds the Bearer token from browser storage
  2- React Query handles the server state layer, assigning rules to specify how to handle time, refetching, or even caching

  ### How authentication and authorization are implemented

  - Authentication is implemented with JWT in auth.service.ts and verified globally by the guard in jwt-auth.guard.ts
    Authorization is implemented at the domain level. Project access is determined by organization role plus project membership through project-access.service.ts
    Task editing rules check project access and task creator permissions in tasks.service.ts

  | Component             | Role                                                         |
  | --------------------- | ------------------------------------------------------------ |
  | JwtAuthGuard          | Validates JWT, attaches user to request                      |
  | CurrentUser decorator | Extracts user.id (and orgs) for controllers                  |
  | ProjectAccessService  | Resolves org role + project role; exports canView(), canManage() |
  | ProjectRole           | PROJECT_MANAGER / MEMBER                                     |
  | OrganizationRole      | OWNER / ADMIN / MEMBER                                       |

  - **Flow:** Controller → CurrentUser('id') → Service → ProjectAccessService.assertCanView(projectId, userId) → throws 403 if no access.

  Entity Relationships

  ```
  Organization (1) ──< OrganizationMember >── (1) User
      │
      └──< Project (1) ──< ProjectMember >── (1) User
                      │
                      └──< Task (1) ──< TaskActivity
                      │
                      └──< Comment
                      │
                      └──< TaskCounter (sequence)
  ```

  - **Key Invariants:**
  - - User must be an OrganizationMember to join any Project.
    - User must be a ProjectMember to be assigned tasks in that project.
    - Task createdBy ≠ assignee (separate concepts)
    - Activity records are immutable once created.

  ------

  ### Risks & Weaknesses

  | #    | Risk                                                | Impact                                                       | Fix Now or Later?                                            |
  | ---- | --------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
  | 4    | **Missing authorization on one task write route**   | In tasks.controller.ts, the updateStatus route accepts only a taskId and DTO; it does not receive the current user identifier. The handler in tasks.service.ts also has updateStatus that directly updates the task with no access check. | **Fix now**. That route can change a task’s status without confirmation that the caller can manage the project or edit the task. It is a direct authorization bypass risk. |
  | 1    | **No idempotency keys on mutations**                | Retried requests (network issues) could double-create tasks or double-assign. | **Later**  add Idempotency-Key header support for POST/PATCH. |
  | 2    | **Activity log grows unbounded**                    | High-traffic projects could accumulate millions of activity records; no TTL or archiving. | **Later**  add partitioning or retention policy.             |
  | 3    | **Single MongoDB instance (no replica set in dev)** | findOneAndUpdate atomicity relies on MongoDB single-primary; not tested under replica set failover. | **Later**  test with replica set; consider transactions for multi-document ops. |

  ------

  ## Code Review

  ### Submitted Implementation

  ```
  async assignTask(taskId: string, assigneeId: string, userId: string) {
    const task = await this.taskModel.findById(taskId);
    if (!task) { throw new NotFoundException(); }
    const user = await this.userModel.findById(assigneeId);
    if (!user) { throw new NotFoundException(); }
    task.assignee = user._id;
    await task.save();
    return task;
  }
  ```

  ------

  ### Critical Issues (Must Fix)

  | #    | Issue                                             | Why It’s a Problem                                           | Fix Required                                                 |
  | ---- | ------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
  | 1    | **No authorization check**                        | Any authenticated user can assign any task to any user, regardless of project membership. Violates RULE #1 (only project members assignable) and RULE #2 (only OWNER/ADMIN/PM can assign others). | Add ProjectAccessService.assertCanView() + permission logic before assignment. |
  | 2    | **No project membership validation for assignee** | Assignee can be any user in the system, not just project members. | Check ProjectMembersService.findRole(task.projectId, assigneeId) returns a role. |
  | 3    | **Actor (****userId****) unused**                 | The userId parameter is accepted but never used for authorization. Self-assignment rule cannot be enforced. | Use userId to check if actor can assign others (canManage) or only self (assigneeId === userId). |

  ------

  ### Significant Issues (Should Fix)

  | #    | Issue                                          | Why It’s a Problem                                           | Fix Required                                                 |
  | ---- | ---------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
  | 6    | **Race condition on task fetch**               | findById → modify → save() is not atomic. Concurrent updates can overwrite each other. | Use findOneAndUpdate with version check, or accept risk (low contention). |
  | 7    | **No validation of** **assigneeId** **format** | Invalid ObjectId strings throw unhelpful Mongoose errors.    | Validate ObjectId format before query; return 400.           |

  ------

## If I Had Two More Days

### 1. Idempotency Keys on All Mutations

**Why:** Network retries, double-clicks, and mobile reconnections cause duplicate requests. Currently a double-click on "Assign" could create two activity records.
**Fix:** Add `Idempotency-Key` header (client-generated UUID) → store in Redis with 24h TTL → return cached response on duplicate. Apply to `create`, `assign`, `unassign`, `updateStatus`.

### 2. Task Search & Filtering (Server-Side)

**Why:** Current `fetchProjectTasks` loads all tasks (up to 100) client-side. Fails at scale.
**Fix:** Add `search`, `assigneeId`, `status`, `priority`, `dateRange` to `ListTasksQueryDto` → MongoDB text index on `title` + compound indexes → cursor pagination.
