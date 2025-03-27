#!/bin/bash

# Wait for RabbitMQ to be ready
echo "Waiting for RabbitMQ to be ready..."
sleep 30

# Create exchanges
echo "Creating exchanges..."
rabbitmqadmin declare exchange name=events_exchange type=topic durable=true

# Create queues
echo "Creating queues..."
rabbitmqadmin declare queue name=tokenization_queue durable=true arguments='{"x-dead-letter-exchange":"tokenization_queue_dlx","x-dead-letter-routing-key":"dead-letter"}'
rabbitmqadmin declare queue name=notification_queue durable=true arguments='{"x-dead-letter-exchange":"notification_queue_dlx","x-dead-letter-routing-key":"dead-letter"}'
rabbitmqadmin declare queue name=analytics_queue durable=true arguments='{"x-dead-letter-exchange":"analytics_queue_dlx","x-dead-letter-routing-key":"dead-letter"}'
rabbitmqadmin declare queue name=email_queue durable=true arguments='{"x-dead-letter-exchange":"email_queue_dlx","x-dead-letter-routing-key":"dead-letter"}'

# Create dead letter queues
echo "Creating dead letter queues..."
rabbitmqadmin declare queue name=tokenization_queue_dlq durable=true
rabbitmqadmin declare queue name=notification_queue_dlq durable=true
rabbitmqadmin declare queue name=analytics_queue_dlq durable=true
rabbitmqadmin declare queue name=email_queue_dlq durable=true

# Create dead letter exchanges
echo "Creating dead letter exchanges..."
rabbitmqadmin declare exchange name=tokenization_queue_dlx type=direct durable=true
rabbitmqadmin declare exchange name=notification_queue_dlx type=direct durable=true
rabbitmqadmin declare exchange name=analytics_queue_dlx type=direct durable=true
rabbitmqadmin declare exchange name=email_queue_dlx type=direct durable=true

# Bind queues to exchanges
echo "Binding queues to exchanges..."
rabbitmqadmin declare binding source=events_exchange destination=tokenization_queue routing_key="tokenization.*"
rabbitmqadmin declare binding source=events_exchange destination=notification_queue routing_key="notification.*"
rabbitmqadmin declare binding source=events_exchange destination=analytics_queue routing_key="analytics.*"
rabbitmqadmin declare binding source=events_exchange destination=email_queue routing_key="email.*"

# Bind dead letter queues
echo "Binding dead letter queues..."
rabbitmqadmin declare binding source=tokenization_queue_dlx destination=tokenization_queue_dlq routing_key="dead-letter"
rabbitmqadmin declare binding source=notification_queue_dlx destination=notification_queue_dlq routing_key="dead-letter"
rabbitmqadmin declare binding source=analytics_queue_dlx destination=analytics_queue_dlq routing_key="dead-letter"
rabbitmqadmin declare binding source=email_queue_dlx destination=email_queue_dlq routing_key="dead-letter"

# Configure policies
echo "Configuring policies..."
rabbitmqctl set_policy TTL ".*" '{"message-ttl":3600000}' --apply-to queues
rabbitmqctl set_policy Max-Length ".*" '{"max-length":100000}' --apply-to queues

# Configure resource limits
echo "Configuring resource limits..."
rabbitmqctl set_vm_memory_high_watermark 0.8
rabbitmqctl set_disk_free_limit "2GB"

echo "RabbitMQ setup complete!"