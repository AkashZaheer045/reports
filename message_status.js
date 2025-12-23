module.exports = function (sequelize, DataTypes) {
    return sequelize.define("message_status", {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        userId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            field: 'user_id',
        },
        userType: {
            type: DataTypes.ENUM('user', 'mandoob', 'admin', 'moderator', 'super_admin'),
            allowNull: false,
            field: 'user_type',
        },
        threadId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            field: 'thread_id',
            references: {
                model: 'threads',
                key: 'id',
            }
        },
        messageId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            field: 'message_id',
            references: {
                model: 'messages',
                key: 'id',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        isRead: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            field: 'is_read',
        },
        readAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'read_at',
        },
        status: {
            // 0: unread
            // 1 : delivered
            // 2 : read
            type: DataTypes.ENUM('0', '1', '2'),
            allowNull: false,
            defaultValue: false,
            field: 'status',
        },
        isDelete: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            field: 'is_delete',
        },
        reaction: {
            type: DataTypes.STRING(10),
            allowNull: true,
            validate: {
                len: [0, 10],
            },
        }
    }, {
        tableName: 'message_status',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                name: 'unique_message_status',
                unique: true,
                fields: ['message_id', 'user_id', 'user_type']
            },
            {
                name: 'idx_user_id_type',
                fields: ['user_id', 'user_type']
            },
            {
                name: 'idx_message_id',
                fields: ['message_id']
            },
            {
                name: 'idx_is_read',
                fields: ['is_read']
            },
            {
                name: 'idx_is_delete',
                fields: ['is_delete']
            },
            {
                name: 'idx_reaction',
                fields: ['reaction']
            }
        ]
    });
};
