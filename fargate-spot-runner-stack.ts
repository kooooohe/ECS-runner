import * as cdk from "@aws-cdk/core";
import * as ecs from "@aws-cdk/aws-ecs";
import * as ecr from "@aws-cdk/aws-ecr";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";

export class FargateSpotRunnerStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a VPC for the Fargate Cluster
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
    });

    // Create an ECS Cluster with Fargate Capacity Provider
    const cluster = new ecs.Cluster(this, "FargateSpotRunnerCluster", {
      vpc,
      capacityProviders: ["FARGATE_SPOT"],
    });

    // Create a task role for the runner
    const taskRole = new iam.Role(this, "FargateSpotRunnerTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonEC2ContainerRegistryReadOnly",
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "CloudWatchAgentServerPolicy",
        ),
      ],
    });

    // Create a task definition for the self-hosted runner
    const runnerTaskDef = new ecs.FargateTaskDefinition(
      this,
      "FargateSpotRunnerTaskDef",
      {
        memoryLimitMiB: 2048,
        cpu: 1024,
        taskRole,
      },
    );

    // Add the self-hosted runner container to the task definition
    const runnerImage = ecs.ContainerImage.fromRegistry(
      "myoung34/github-runner:latest",
    );
    runnerTaskDef.addContainer("Runner", {
      image: runnerImage,
      environment: {
        GITHUB_PAT:  process.env.GITHUB_PERSONAL_TOKEN || "",
        RUNNER_WORKDIR: "/tmp/github-runner",
        //RUNNER_GROUP_TOKEN: "<your GitHub Actions runner group token>",
        RUNNER_REPOSITORY_URL: process.env.GITHUB_REPOSITORY_URL || "",
        RUNNER_LABELS: "fargate-spot",
        GITHUB_OWNER: process.env.GITHUB_USERNAME || "",
        GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY_NAME || "",
      },
      logging: new ecs.AwsLogDriver({
        streamPrefix: "FargateSpotRunner",
      }),
    });
    // Create a security group for the Fargate service
    const securityGroup = new ec2.SecurityGroup(
      this,
      "FargateSpotRunnerSecurityGroup",
      {
        vpc,
      },
    );

    // Allow inbound traffic on port 22 for SSH access (optional)
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow SSH access",
    );

    // Create an ECS Fargate service with a single task
    new ecs.FargateService(this, "FargateSpotRunnerService", {
      cluster,
      taskDefinition: runnerTaskDef,
      securityGroups: [securityGroup],
      desiredCount: 1,
      capacityProviderStrategies: [
        {
          capacityProvider: "FARGATE_SPOT",
          weight: 1,
        },
      ],
    });
  }
}
