import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { TasksModule } from './tasks.module';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { ProjectMembersModule } from '../project-members/project-members.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { OrganizationMembersModule } from '../organization-members/organization-members.module';
import { AuthModule } from '../auth/auth.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';
import { OrganizationMember, OrganizationMemberSchema } from '../organization-members/schemas/organization-member.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { ProjectMember, ProjectMemberSchema } from '../project-members/schemas/project-member.schema';
import { Task, TaskSchema } from './schemas/task.schema';
import { TaskActivity, TaskActivitySchema } from './schemas/task-activity.schema';
import { TaskCounter, TaskCounterSchema } from './schemas/task-counter.schema';
import { TaskStatus, TaskPriority, ProjectRole, OrganizationRole } from '@projectflow/shared';
import * as bcrypt from 'bcryptjs';

describe('Task Assignment & Activity - Business Rules', () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  let moduleRef: TestingModule;

  // Test users
  let ownerToken: string;        // Organization OWNER
  let adminToken: string;        // Organization ADMIN
  let pmToken: string;           // PROJECT_MANAGER
  let memberToken: string;       // Regular MEMBER
  let outsiderToken: string;     // Not in project
  let otherProjectMemberToken: string; // Member of different project

  // Test data
  let organizationId: Types.ObjectId;
  let projectId: Types.ObjectId;
  let otherProjectId: Types.ObjectId;
  let taskId: Types.ObjectId;
  let ownerId: Types.ObjectId;
  let adminId: Types.ObjectId;
  let pmId: Types.ObjectId;
  let memberId: Types.ObjectId;
  let outsiderId: Types.ObjectId;
  let otherProjectMemberId: Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: Organization.name, schema: OrganizationSchema },
          { name: OrganizationMember.name, schema: OrganizationMemberSchema },
          { name: Project.name, schema: ProjectSchema },
          { name: ProjectMember.name, schema: ProjectMemberSchema },
          { name: Task.name, schema: TaskSchema },
          { name: TaskActivity.name, schema: TaskActivitySchema },
          { name: TaskCounter.name, schema: TaskCounterSchema },
        ]),
        AuthModule,
        UsersModule,
        OrganizationsModule,
        OrganizationMembersModule,
        ProjectsModule,
        ProjectMembersModule,
        TasksModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key]?.deleteMany({});
    }

    const passwordHash = await bcrypt.hash('Password123!', 12);

    // Create organization
    const org = await mongoose.model('Organization', OrganizationSchema).create({
      name: 'Test Org',
      slug: 'test-org',
      ownerId: new Types.ObjectId(),
    });
    organizationId = org._id;

    // Create users
    const users = await mongoose.model('User', UserSchema).insertMany([
      { name: 'Owner', email: 'owner@test.com', passwordHash, avatarUrl: null },
      { name: 'Admin', email: 'admin@test.com', passwordHash, avatarUrl: null },
      { name: 'PM', email: 'pm@test.com', passwordHash, avatarUrl: null },
      { name: 'Member', email: 'member@test.com', passwordHash, avatarUrl: null },
      { name: 'Outsider', email: 'outsider@test.com', passwordHash, avatarUrl: null },
      { name: 'OtherPM', email: 'otherpm@test.com', passwordHash, avatarUrl: null },
    ]);
    ownerId = users[0]!._id;
    adminId = users[1]!._id;
    pmId = users[2]!._id;
    memberId = users[3]!._id;
    outsiderId = users[4]!._id;
    otherProjectMemberId = users[5]!._id;

    // Organization memberships
    await mongoose.model('OrganizationMember', OrganizationMemberSchema).insertMany([
      { organizationId, userId: ownerId, role: OrganizationRole.OWNER },
      { organizationId, userId: adminId, role: OrganizationRole.ADMIN },
      { organizationId, userId: pmId, role: OrganizationRole.MEMBER },
      { organizationId, userId: memberId, role: OrganizationRole.MEMBER },
      { organizationId, userId: outsiderId, role: OrganizationRole.MEMBER },
      { organizationId, userId: otherProjectMemberId, role: OrganizationRole.MEMBER },
    ]);

    // Create two projects
    const projects = await mongoose.model('Project', ProjectSchema).insertMany([
      { organizationId, name: 'Project A', key: 'PROJA', description: 'Project A', createdBy: ownerId },
      { organizationId, name: 'Project B', key: 'PROJB', description: 'Project B', createdBy: adminId },
    ]);
    projectId = projects[0]!._id;
    otherProjectId = projects[1]!._id;

    // Project memberships for Project A
    await mongoose.model('ProjectMember', ProjectMemberSchema).insertMany([
      { projectId, userId: pmId, role: ProjectRole.PROJECT_MANAGER },
      { projectId, userId: memberId, role: ProjectRole.MEMBER },
    ]);

    // Project memberships for Project B
    await mongoose.model('ProjectMember', ProjectMemberSchema).insertMany([
      { projectId: otherProjectId, userId: otherProjectMemberId, role: ProjectRole.MEMBER },
    ]);

    // Create task in Project A (created by member)
    const task = await mongoose.model('Task', TaskSchema).create({
      projectId,
      number: 1,
      key: 'PROJA-1',
      title: 'Test Task',
      description: 'Test description',
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      createdBy: memberId,
    });
    taskId = task._id;

    // Get tokens
    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'Password123!' });
      return res.body.accessToken;
    };

    ownerToken = await login('owner@test.com');
    adminToken = await login('admin@test.com');
    pmToken = await login('pm@test.com');
    memberToken = await login('member@test.com');
    outsiderToken = await login('outsider@test.com');
    otherProjectMemberToken = await login('otherpm@test.com');
  });

  // Helper functions
  const assignTask = (token: string, assigneeId?: string) =>
    request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', `Bearer ${token}`)
      .send(assigneeId ? { assigneeId } : {});

  const unassignTask = (token: string) =>
    request(app.getHttpServer())
      .delete(`/tasks/${taskId}/assignee`)
      .set('Authorization', `Bearer ${token}`);

  const getActivity = (token: string) =>
    request(app.getHttpServer())
      .get(`/tasks/${taskId}/activity`)
      .set('Authorization', `Bearer ${token}`);

  const createTask = (token: string, projectId: string) =>
    request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New Task', status: TaskStatus.TODO, priority: TaskPriority.MEDIUM });

  describe('ASSIGNEE BUSINESS RULES', () => {
    describe('A project member can assign themselves', () => {
      it('MEMBER can assign task to themselves', async () => {
        const res = await assignTask(memberToken, memberId.toString());
        expect(res.status).toBe(200);
        expect(res.body.assignee.id).toBe(memberId.toString());
      });

      it('PROJECT_MANAGER can assign task to themselves', async () => {
        const res = await assignTask(pmToken, pmId.toString());
        expect(res.status).toBe(200);
        expect(res.body.assignee.id).toBe(pmId.toString());
      });

      it('OWNER can assign task to themselves', async () => {
        const res = await assignTask(ownerToken, ownerId.toString());
        expect(res.status).toBe(200);
        expect(res.body.assignee.id).toBe(ownerId.toString());
      });

      it('ADMIN can assign task to themselves', async () => {
        const res = await assignTask(adminToken, adminId.toString());
        expect(res.status).toBe(200);
        expect(res.body.assignee.id).toBe(adminId.toString());
      });
    });

    describe('An authorized project role can assign another project member', () => {
      it('PROJECT_MANAGER can assign another member', async () => {
        const res = await assignTask(pmToken, memberId.toString());
        expect(res.status).toBe(200);
        expect(res.body.assignee.id).toBe(memberId.toString());
      });

      it('OWNER can assign another member', async () => {
        const res = await assignTask(ownerToken, memberId.toString());
        expect(res.status).toBe(200);
        expect(res.body.assignee.id).toBe(memberId.toString());
      });

      it('ADMIN can assign another member', async () => {
        const res = await assignTask(adminToken, memberId.toString());
        expect(res.status).toBe(200);
        expect(res.body.assignee.id).toBe(memberId.toString());
      });
    });

    describe('A regular member cannot assign another user', () => {
      it('MEMBER cannot assign another member (403)', async () => {
        const res = await assignTask(memberToken, pmId.toString());
        expect(res.status).toBe(403);
        expect(res.body.message).toContain('yourself');
      });

      it('MEMBER cannot assign PROJECT_MANAGER (403)', async () => {
        const res = await assignTask(memberToken, pmId.toString());
        expect(res.status).toBe(403);
      });
    });

    describe('A user outside the project cannot be assigned', () => {
      it('outsider cannot be assigned by PM (403)', async () => {
        const res = await assignTask(pmToken, outsiderId.toString());
        expect(res.status).toBe(403);
        expect(res.body.message).toContain('member of the project');
      });

      it('member of other project cannot be assigned (403)', async () => {
        const res = await assignTask(pmToken, otherProjectMemberId.toString());
        expect(res.status).toBe(403);
        expect(res.body.message).toContain('member of the project');
      });

      it('organization member not in project cannot be assigned (403)', async () => {
        const res = await assignTask(pmToken, adminId.toString()); // admin is org member but not project member
        expect(res.status).toBe(403);
      });
    });

    describe('Unauthorized users cannot modify another project\'s tasks', () => {
      it('outsider cannot assign (403)', async () => {
        const res = await assignTask(outsiderToken, memberId.toString());
        expect(res.status).toBe(403);
      });

      it('member of other project cannot assign (403)', async () => {
        const res = await assignTask(otherProjectMemberToken, memberId.toString());
        expect(res.status).toBe(403);
      });

      it('outsider cannot unassign (403)', async () => {
        // First assign to someone
        await assignTask(pmToken, memberId.toString());
        const res = await unassignTask(outsiderToken);
        expect(res.status).toBe(403);
      });

      it('member of other project cannot unassign (403)', async () => {
        await assignTask(pmToken, memberId.toString());
        const res = await unassignTask(otherProjectMemberToken);
        expect(res.status).toBe(403);
      });
    });
  });

  describe('ACTIVITY RECORDS', () => {
    describe('Changing an assignee creates an activity record', () => {
      it('assignment creates TASK_ASSIGNEE_CHANGED activity', async () => {
        await assignTask(pmToken, memberId.toString());

        const activityRes = await getActivity(pmToken);
        expect(activityRes.status).toBe(200);
        expect(activityRes.body.items).toHaveLength(1);
        expect(activityRes.body.items[0].type).toBe('TASK_ASSIGNEE_CHANGED');
        expect(activityRes.body.items[0].metadata.from).toBeNull();
        expect(activityRes.body.items[0].metadata.to.id).toBe(memberId.toString());
        expect(activityRes.body.items[0].actor.id).toBe(pmId.toString());
      });

      it('reassignment creates activity with from/to', async () => {
        await assignTask(pmToken, memberId.toString());
        await assignTask(pmToken, pmId.toString());

        const activityRes = await getActivity(pmToken);
        expect(activityRes.status).toBe(200);
        expect(activityRes.body.items).toHaveLength(2);

        // Latest first (newest first)
        const reassignment = activityRes.body.items[0];
        expect(reassignment.type).toBe('TASK_ASSIGNEE_CHANGED');
        expect(reassignment.metadata.from.id).toBe(memberId.toString());
        expect(reassignment.metadata.to.id).toBe(pmId.toString());

        const initialAssignment = activityRes.body.items[1];
        expect(initialAssignment.metadata.from).toBeNull();
        expect(initialAssignment.metadata.to.id).toBe(memberId.toString());
      });
    });

    describe('Unassigning a task creates the appropriate activity', () => {
      it('unassignment creates activity with from=user, to=null', async () => {
        await assignTask(pmToken, memberId.toString());
        await unassignTask(pmToken);

        const activityRes = await getActivity(pmToken);
        expect(activityRes.status).toBe(200);
        expect(activityRes.body.items).toHaveLength(2);

        const unassignment = activityRes.body.items[0];
        expect(unassignment.type).toBe('TASK_ASSIGNEE_CHANGED');
        expect(unassignment.metadata.from.id).toBe(memberId.toString());
        expect(unassignment.metadata.to).toBeNull();
      });

      it('self-unassignment creates activity', async () => {
        await assignTask(memberToken, memberId.toString());
        await unassignTask(memberToken);

        const activityRes = await getActivity(memberToken);
        expect(activityRes.body.items).toHaveLength(2);
        const unassignment = activityRes.body.items[0];
        expect(unassignment.metadata.from.id).toBe(memberId.toString());
        expect(unassignment.metadata.to).toBeNull();
      });
    });

    describe('Unauthorized users cannot access task activity', () => {
      it('outsider cannot get activity (403)', async () => {
        const res = await getActivity(outsiderToken);
        expect(res.status).toBe(403);
      });

      it('member of other project cannot get activity (403)', async () => {
        const res = await getActivity(otherProjectMemberToken);
        expect(res.status).toBe(403);
      });

      it('unauthenticated cannot get activity (401)', async () => {
        const res = await request(app.getHttpServer())
          .get(`/tasks/${taskId}/activity`);
        expect(res.status).toBe(401);
      });
    });
  });

  describe('CONCURRENT TASK CREATION', () => {
    it('concurrent creation cannot duplicate a task identifier', async () => {
      const CONCURRENT_REQUESTS = 10;
      const promises = Array.from({ length: CONCURRENT_REQUESTS }, () =>
        createTask(ownerToken, projectId.toString())
      );

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(res => {
        expect(res.status).toBe(201);
        expect(res.body.number).toBeGreaterThan(0);
      });

      // All numbers should be unique
      const numbers = results.map(r => r.body.number);
      const uniqueNumbers = new Set(numbers);
      expect(uniqueNumbers.size).toBe(CONCURRENT_REQUESTS);

      // Numbers should be sequential (1, 2, 3, ... since we started with 1 existing)
      const sortedNumbers = [...numbers].sort((a, b) => a - b);
      expect(sortedNumbers).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    });

    it('concurrent creation across different projects are independent', async () => {
      const promises = [
        createTask(ownerToken, projectId.toString()),
        createTask(adminToken, otherProjectId.toString()),
        createTask(ownerToken, projectId.toString()),
        createTask(adminToken, otherProjectId.toString()),
      ];

      const results = await Promise.all(promises);
      results.forEach(res => expect(res.status).toBe(201));

      // Project A tasks should have sequential numbers
      const projATasks = results.filter(r => r.body.key.startsWith('PROJA'));
      const projBTasks = results.filter(r => r.body.key.startsWith('PROJB'));

      expect(projATasks.length).toBe(2);
      expect(projBTasks.length).toBe(2);

      const aNumbers = projATasks.map(r => r.body.number).sort((a, b) => a - b);
      const bNumbers = projBTasks.map(r => r.body.number).sort((a, b) => a - b);

      // Both start from 2 (since each has 1 existing)
      expect(aNumbers).toEqual([2, 3]);
      expect(bNumbers).toEqual([2, 3]);
    });
  });

  describe('EDGE CASES', () => {
    it('assigning to same user twice is idempotent (no duplicate activity)', async () => {
      await assignTask(pmToken, memberId.toString());
      await assignTask(pmToken, memberId.toString()); // Same assignee

      const activityRes = await getActivity(pmToken);
      // Should only have 1 activity (the first assignment)
      expect(activityRes.body.items).toHaveLength(1);
    });

    it('unassigning already unassigned task is idempotent', async () => {
      const res1 = await unassignTask(pmToken);
      expect(res1.status).toBe(204);

      const res2 = await unassignTask(pmToken);
      expect(res2.status).toBe(204);

      const activityRes = await getActivity(pmToken);
      expect(activityRes.body.items).toHaveLength(0);
    });

    it('activity includes actor info (not just ID)', async () => {
      await assignTask(pmToken, memberId.toString());

      const activityRes = await getActivity(pmToken);
      const activity = activityRes.body.items[0];
      expect(activity.actor).toHaveProperty('name', 'PM');
      expect(activity.actor).toHaveProperty('email', 'pm@test.com');
      expect(activity.metadata.to).toHaveProperty('name', 'Member');
    });
  });
});