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
import { TaskStatus, TaskPriority, ProjectRole, OrganizationRole } from '@projectflow/shared';
import * as bcrypt from 'bcryptjs';

describe('Task Status Update Authorization (Regression Test)', () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  let moduleRef: TestingModule;

  // Test users
  let aliceToken: string;    // Project member
  let bobToken: string;      // Non-member
  let adminToken: string;    // Organization admin
  let pmToken: string;       // Project manager
  let creatorToken: string;  // Task creator (regular member)

  // Test data
  let organizationId: Types.ObjectId;
  let projectId: Types.ObjectId;
  let taskId: Types.ObjectId;
  let aliceId: Types.ObjectId;
  let adminId: Types.ObjectId;
  let pmId: Types.ObjectId;
  let creatorId: Types.ObjectId;

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
    // Clean collections
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key]?.deleteMany({});
    }

    // Setup test data
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
      { name: 'Alice', email: 'alice@test.com', passwordHash, avatarUrl: null },
      { name: 'Bob', email: 'bob@test.com', passwordHash, avatarUrl: null },
      { name: 'Admin', email: 'admin@test.com', passwordHash, avatarUrl: null },
      { name: 'PM', email: 'pm@test.com', passwordHash, avatarUrl: null },
      { name: 'Creator', email: 'creator@test.com', passwordHash, avatarUrl: null },
    ]);
    aliceId = users[0]!._id;
    // bobId = users[1]!._id; // used via bobToken
    adminId = users[2]!._id;
    pmId = users[3]!._id;
    creatorId = users[4]!._id;

    // Create organization memberships
    await mongoose.model('OrganizationMember', OrganizationMemberSchema).insertMany([
      { organizationId, userId: aliceId, role: OrganizationRole.MEMBER },
      { organizationId, userId: adminId, role: OrganizationRole.ADMIN },
      { organizationId, userId: pmId, role: OrganizationRole.MEMBER },
      { organizationId, userId: creatorId, role: OrganizationRole.MEMBER },
    ]);

    // Create project
    const project = await mongoose.model('Project', ProjectSchema).create({
      organizationId,
      name: 'Test Project',
      key: 'TEST',
      description: 'Test project',
      createdBy: adminId,
    });
    projectId = project._id;

    // Create project memberships
    await mongoose.model('ProjectMember', ProjectMemberSchema).insertMany([
      { projectId, userId: aliceId, role: ProjectRole.MEMBER },
      { projectId, userId: pmId, role: ProjectRole.PROJECT_MANAGER },
      { projectId, userId: creatorId, role: ProjectRole.MEMBER },
    ]);

    // Create task (created by creator)
    const task = await mongoose.model('Task', TaskSchema).create({
      projectId,
      number: 1,
      key: 'TEST-1',
      title: 'Test Task',
      description: 'Test description',
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      createdBy: creatorId,
    });
    taskId = task._id;

    // Get tokens
    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'Password123!' });
      return res.body.accessToken;
    };

    aliceToken = await login('alice@test.com');
    bobToken = await login('bob@test.com');
    adminToken = await login('admin@test.com');
    pmToken = await login('pm@test.com');
    creatorToken = await login('creator@test.com');
  });

  const updateStatus = (token: string, status: TaskStatus) =>
    request(app.getHttpServer())
      .patch(`/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status });

  describe('PATCH /tasks/:taskId/status', () => {
    it('should allow project member to update task status', async () => {
      const res = await updateStatus(aliceToken, TaskStatus.IN_PROGRESS);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('should allow project manager to update task status', async () => {
      const res = await updateStatus(pmToken, TaskStatus.IN_PROGRESS);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('should allow organization admin to update task status', async () => {
      const res = await updateStatus(adminToken, TaskStatus.IN_PROGRESS);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('should allow task creator to update task status', async () => {
      const res = await updateStatus(creatorToken, TaskStatus.IN_PROGRESS);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('should DENY non-member from updating task status (REGRESSION TEST)', async () => {
      const res = await updateStatus(bobToken, TaskStatus.IN_PROGRESS);
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('access');
    });

    it('should DENY unauthenticated requests', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/status`)
        .send({ status: TaskStatus.IN_PROGRESS });
      expect(res.status).toBe(401);
    });
  });
});