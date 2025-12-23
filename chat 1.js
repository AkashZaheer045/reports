
const sequelize = require('./../../../../db/sequelize/sequelize');
const { Sequelize, Op, col } = require('sequelize')
// const mySqlConnection = require('./../../../../db/sequelize/connection_mysql')
const Pagination = require("./../../../../helpers/pagination");
const { setManualPagination } = require('../../../../helpers/common');

/* DB Instances */
let userInstance = new sequelize.db(sequelize.models.users);
let mandoobUserInstance = new sequelize.db(sequelize.models.mandoob_users);
const userAuthorizationsKeysInstance = new sequelize.db(sequelize.models.users_authorizations);
const messagesMediaInstance = new sequelize.db(sequelize.models.messages_media);


const getThreadsForInbox = async (req) => {
    try {
        let { userId, search, userType} = req.body;
        if (!userId) { userId = req.appUser.id; }
        if (!userType) { userType = req.appUser.role.roleName }

        userType = userType === "user" ? "user"
                  :userType === "admin" ? "admin"
                  :userType === "super_admin" ? "super_admin"
                  :userType === "moderator" ? "moderator"
                  :(userType === "corporate" || userType === "individual") ? "mandoob"
                  : null; // fallback if none match

        // get all threads by pagination
        let findQuery = {
            // subQuery: false,
            // distinct: true,
            logging: false,
            where: {},
            include: [
                {
                    required: true,
                    model: sequelize.models.bookings,
                    as: 'bookingDetails',
                    attributes: ['id', 'user_id', 'mandoob_id', 'status', 'service_id', 'cancel_reason'],
                    where: {
                        status: { [Op.notIn]: ["pending", "cancelled", "rejected"] }
                    }
                },
                {
                    required: true,
                    model: sequelize.models.chat_participants,
                    // as: "participants",
                    where: {
                        userType: userType,
                        userId: userId
                    },
                },
                // Return all participants for the thread except current
                {
                    required: true,
                    model: sequelize.models.chat_participants,
                    as: "participants",
                    include: [
                        {
                            model: sequelize.models.users.scope("withMinFields"),
                            as: 'user',
                            required: false,
                            where: {
                                // ...(search ? { name: { [Op.like]: `%${search}%` } } : undefined)
                            }
                        },
                        {
                            model: sequelize.models.mandoob_users.scope("withMinFields"),
                            as: 'mandoobUser',
                            required: false,
                            where: {
                                // ...(search ? { name: { [Op.like]: `%${search}%` } } : undefined)
                            }
                        }
                    ]
                },
                // get last message
                {
                    required: false,
                    model: sequelize.models.messages,
                    as: 'messages', // must match association alias
                    // where: {
                    //     senderId: userId
                    // },
                    // where: {
                    //     senderType: { [Op.in]: ['user', 'admin', 'mandoob'] },
                    //     ...(search ? { content: { [Op.like]: `%${search}%` } } : undefined)
                    // },
                    // order: [['created_at', 'DESC']],
                    // limit: 1,

                    // doing in this way because when we do order and limit with sequelize in include than it is executed in separate query and we not able to get it in global where
                    where: {
                        created_at: {
                            [Op.eq]: Sequelize.literal(`(
                                SELECT MAX(m2.created_at)
                                FROM messages m2
                                WHERE m2.thread_id = threads.id
                                )`)
                        },
                        [Op.or]: [{
                            senderType: { [Op.in]: ['user', 'admin', 'mandoob'] },
                            // },
                            // {
                            // ...(search ? { content: { [Op.like]: `%${search}%` } } : undefined)
                        }]
                    },

                    // get last message user
                    include: [
                        {
                            required: false,
                            model: sequelize.models.users.scope("withMinFields"),
                            as: 'user',
                        },
                        {
                            required: false,
                            model: sequelize.models.mandoob_users.scope("withMinFields"),
                            as: 'mandoobUser',
                        }
                    ]
                },
                // get unread messages
                {
                    required: false,
                    model: sequelize.models.message_status,
                    attributes: ['id'],
                    // attributes: [[Sequelize.fn('COUNT', Sequelize.col('message_statuses.id')), 'nos'],],

                    where: {
                        userId: userId,
                        status: "0"
                    },
                },
            ],
            // distinct: true,
            // group: [`threads.id`],
            // order: [['created_at', 'DESC']]

        }

        if (search) {
    const likeSearch = { [Op.like]: `%${search}%` };

    if (req.userRole !== 'admin') {
        // For non-admin users, search other participants (not themselves)
        findQuery.where[Op.and] = [
            {
                [Op.or]: [
                    // Search in other participant's user table
                    {
                        [Op.and]: [
                            { '$participants.user.name$': likeSearch },
                            { '$participants.user.id$': { [Op.ne]: userId } }
                        ]
                    },
                    // Search in other participant's mandoob table  
                    {
                        [Op.and]: [
                            { '$participants.mandoobUser.name$': likeSearch },
                            { '$participants.mandoobUser.id$': { [Op.ne]: userId } }
                        ]
                    }
                ]
            }
        ];
    } else {
        // For admin, search all participants
        findQuery.where[Op.or] = [
            { '$participants.user.name$': likeSearch },
            { '$participants.mandoobUser.name$': likeSearch }
        ];
    }
}

        // get booking chat list
        findQuery.where.type = 'booking'


        let pagination = new Pagination(req, findQuery);
        const instance = new sequelize.db(sequelize.models.threads);
        let [threads, terr] = await instance.findAndCountAll(findQuery);
        if (terr) return [null, terr]

        threads.rows.map(thread => {
            // set virtual field
            if (thread.messages && thread.messages.length > 0) {
                thread.messages[0].sender = thread.messages[0].user || thread.messages[0].mandoobUser;
                delete thread.messages[0].dataValues.user;
                delete thread.messages[0].dataValues.mandoobUser;
            }

            // set virtual field for participants
            if (thread.participants && thread.participants.length > 0) {
                for (const participant of thread.participants) {
                    participant.dataValues.user = participant.userType == 'user' ? participant.user : participant.mandoobUser;
                    // delete thread.messages[0].dataValues.user;
                    delete participant.dataValues.mandoobUser;
                }
            }


            // unreadCount
            if (thread.message_statuses && thread.message_statuses.length > 0) {

                thread.dataValues.unreadCount = thread.message_statuses.length || 0;
                delete thread.dataValues.message_statuses;
            }
            else {
                delete thread.dataValues.message_statuses;
                thread.dataValues.unreadCount = thread.message_statuses.length || 0;
            }
        });

        const sorted = threads.rows.sort((a, b) => {
            const aLastMsg = a.messages?.[a.messages.length - 1];
            const bLastMsg = b.messages?.[b.messages.length - 1];

            const aDate = aLastMsg ? new Date(aLastMsg.created_at) : new Date(0);
            const bDate = bLastMsg ? new Date(bLastMsg.created_at) : new Date(0);

            return bDate - aDate; // DESC (newest first)
        });

        pagination.setCount(threads.rows.length || 0)

        // get support chat list

        if (req.userRole === 'admin') {
            findQuery.where.type = 'support'
            findQuery.include.shift(); //remove booking
            //delete findQuery.include[0].where.userId;  //only show admin's own chats
            delete findQuery.include[3].where.userId;
            findQuery.include[2].required = false;
        } else {
            findQuery.where.type = 'support'
            findQuery.logging = true
            findQuery.include.shift();  //remove booking
            delete findQuery.include[3].where.userId;
            findQuery.include[2].required = false;
        }

        let adminPagination = new Pagination(req, findQuery);
        let [adminThreads, adminTErr] = await instance.findAndCountAll(findQuery);
        if (adminTErr) return [null, adminTErr]

        adminThreads.rows.map(thread => {

            // set virtual field
            if (thread.messages && thread.messages.length > 0) {
                thread.messages[0].sender = thread.messages[0].user || thread.messages[0].mandoobUser;
                delete thread.messages[0].dataValues.user;
                delete thread.messages[0].dataValues.mandoobUser;
            }

            // set virtual field for participants
            if (thread.participants && thread.participants.length > 0) {
            for (const participant of thread.participants) {
                if (participant.userType === 'admin' || participant.userType === 'user') {
                    participant.dataValues.user = participant.user;
                } else if (participant.userType === 'mandoob') {
                    participant.dataValues.user = participant.mandoobUser;
                }
                delete participant.dataValues.mandoobUser;
            }
        }

            // unreadCount
            if (thread.message_statuses && thread.message_statuses.length > 0) {

                thread.dataValues.unreadCount = thread.message_statuses.length || 0;
                delete thread.dataValues.message_statuses;
            }
            else {
                delete thread.dataValues.message_statuses;
                thread.dataValues.unreadCount = thread.message_statuses.length || 0;
            }
        });

        const adminListSorted = adminThreads.rows.sort((a, b) => {
            const aLastMsg = a.messages?.[a.messages.length - 1];
            const bLastMsg = b.messages?.[b.messages.length - 1];

            const aDate = aLastMsg ? new Date(aLastMsg.created_at) : new Date(0);
            const bDate = bLastMsg ? new Date(bLastMsg.created_at) : new Date(0);

            return bDate - aDate; // DESC (newest first)
        });

        adminPagination.setCount(adminThreads.rows.length || 0)
        // return [{ list: sorted, pagination, list2: adminListSorted, adminPagination }, null]

        return [{ booking: { list: sorted, pagination }, support: { list: adminListSorted, pagination: adminPagination } }, null]
        // list: paginatedServices.list, pagination: paginatedServices.pagination
        // return [{ list: paginatedThreads.list, pagination: paginatedThreads.pagination }, null]
    }
    catch (error) { return [null, error] }
}

const getAllThreads = async (data) => {
    try{
    const instance = new sequelize.db(sequelize.models.threads);

    return await instance.findAll({
        attributes: ['id'],
        // logging: true,
        include: [{
            model: sequelize.models.chat_participants,
            as: 'participants',
            required: true,
            where: { [Op.or]: [{ userId: data.id }], }
        }],
        where: { status: 'active' }
    });
    }catch(err){
    return [null, err];
}
}

const getThreadsPagination = async (data) => {
    try{
    const instance = new sequelize.db(sequelize.models.threads);

    return await instance.findAndCountAll(data);
       }
    catch (error) { return [null, error] }
}

const getLastMessage = async (findQuery) => {
try{
    const instance = new sequelize.db(sequelize.models.messages);
    return await instance.findOne(findQuery);
    }
    catch (error) { return [null, error] }

}

const getUnreadCount = async (findQuery) => {
    try{
    const instance = new sequelize.db(sequelize.models.messages);
    return await instance.findOne(findQuery);
    }
    catch (error) { return [null, error] }
}

const checkUserBlockStatus = async (data) => {
try{
    const instance = new sequelize.db(sequelize.models.report_block_users);

    return await instance.findOne({
        where: {
            from_user_id: data.from_id,
            to_user_id: data.to_id,
            is_blocked: 1
        }
    });
    // return await instance.findOne({
    //     where: {
    //         from_user_id: {
    //             [Op.or]: [data.from_id, data.to_id]
    //         },
    //         to_user_id: {
    //             [Op.or]: [data.from_id, data.to_id]
    //         },
    //     }
    // });
    }
    catch (error) { return [null, error] }
}
const checkToUserBlockStatus = async (data) => {
try{
    const instance = new sequelize.db(sequelize.models.report_block_users);

    return await instance.findOne({
        where: {
            from_user_id: data.to_id,
            to_user_id: data.from_id,
            is_blocked: 1
        }
    });
    // return await instance.findOne({
    //     where: {
    //         from_user_id: {
    //             [Op.or]: [data.from_id, data.to_id]
    //         },
    //         to_user_id: {
    //             [Op.or]: [data.from_id, data.to_id]
    //         },
    //     }
    // });
    }
    catch (error) { return [null, error] }
}


const getThread = async (id) => {
    try{
    const instance = new sequelize.db(sequelize.models.threads);

    return await instance.findOne({
        logging: true,
        include: [{
            model: sequelize.models.chat_participants,
            as: 'participants',
            required: true,
            // where: { [Op.or]: [{ userId: data.id }], }
        }], where: { id }
    });
    }
    catch (error) { return [null, error] }
}

const getAllThreadWithParticipant = async (outerWhere, innerWhere) => {
try{
    const instance = new sequelize.db(sequelize.models.threads);

    return await instance.findAll({
        logging: true,
        include: [{
            model: sequelize.models.chat_participants,
            as: 'participants',
            required: true,
            where: innerWhere
        }], where: outerWhere
    });
    }
    catch (error) { return [null, error] }
    
}

const getThreadWithParticipant = async (outerWhere, innerWhere) => {
    try{
    const instance = new sequelize.db(sequelize.models.threads);

    return await instance.findOne({
        logging: true,
        include: [{
            model: sequelize.models.chat_participants,
            as: 'participants',
            required: true,
            where: innerWhere
        }], where: outerWhere
    });
    }
    catch (error) { return [null, error] }
}

const createThread = async (data) => {
try {
    const instance = new sequelize.db(sequelize.models.threads);

    return await instance.create(data);
    }
    catch (error) { return [null, error] }
}

const createChatParticipants = async (data) => {
try {
    const instance = new sequelize.db(sequelize.models.chat_participants);
    return await instance.bulkCreate(data);
    }
    catch (error) { return [null, error] }
}

const bulkmessageStatusInsert = async (data) => {
try{
    const instance = new sequelize.db(sequelize.models.message_status);
    return await instance.bulkCreate(data);
    }
    catch (error) { return [null, error] }
}

const insertMessage = async (data) => {
try{
    const messagesInstance = new sequelize.db(sequelize.models.messages);

    return await messagesInstance.create(data);
    }
    catch (error) { return [null, error] }
}

const updateMessageReadStatus = async (threadId, userId) => {
try{
    return await sequelize.models.message_status.update({ status: "2", readAt: new Date() }
        , {
            where: {
                threadId,
                userId
            }
        });
  }
    catch (error) { return [null, error] }
}

// const getInbox = async (userId) => {
//     try {
//         return new Promise((resolve, reject) => {
//             let inboxQuery = `SELECT * 
//             FROM messages 
//             INNER JOIN 
//             (SELECT MAX(id) as id FROM messages where (to_id=${userId} or from_id=${userId}) and room_name is not null GROUP BY room_name) last_updates 
//             ON last_updates.id = messages.id left join users u on ((u.id=messages.from_id and messages.from_id<>${userId} )) or ((u.id=messages.to_id and messages.to_id<>${userId} )) order by messages.id desc limit 10`
//             mySqlConnection.mysql_connection.query(inboxQuery, function (err, conversations, fields) {
//                 if (err)
//                     reject(err)
//                 resolve(conversations);
//             })
//         })
//     } catch (err) {
//         console.log(err);
//     }
// }
const getMessages = async (data) => {
try{
    const messagesInstance = new sequelize.db(sequelize.models.messages);
    return await messagesInstance.findAndCountAll(data.findQuery)
}
    catch (error) { return [null, error] }
}

const getProfile = async (findQuery, role) => {
try{
    if (role == 'mandoob') {
        return await mandoobUserInstance.findOne(findQuery)

    } else
        return await userInstance.findOne(findQuery)
}
    catch (error) { return [null, error] }
}

const setOnlineStatus = async (data) => {
try{
    let { status, userId, userType } = data

    if (userType == 'mandoob') {
        return await sequelize.models.mandoob_users.update({ onlineStatus: status }
            , {
                // logging: true,
                where: {
                    id: userId
                }
            });
    } else {
        return await sequelize.models.users.update({ onlineStatus: status }
            , {
                // logging: true,
                where: {
                    id: userId
                }
            });
    }
}
    catch (error) { return [null, error] }

}


const bulkMediaInsert = async (data) => {
    try{
    return await sequelize.models.messages_media.bulkCreate(data);
    }
    catch (error) { return [null, error] }
}


const joinPrivateRooms = async (socket) => {
    try{
    let query = `select to_id as id from messages where from_id=${socket?.user?.id}  and conversation_type<>'support' group by to_id    union    select from_id as id from messages where to_id = ${socket?.user?.id} and conversation_type<>'support' group by from_id`;
    mySqlConnection.mysql_connection.query(query,
        function (err, users, fields) {
            if (users.length > 0) {
                users.map(user => {
                    const roomName = socket?.user?.id > user?.id ? `private_${user?.id}_${socket?.user?.id}` : `private_${socket?.user?.id}_${user?.id}`
                    socket.join(roomName)
                })
            }
            console.log(err);
        });
    }
    catch (error) { return [null, error] }
}

//code by hisham

//Message Status for admin
const getMessagesStatus = async (threadId) => {
try{
    const instance = new sequelize.db(sequelize.models.message_status);

    return await instance.findAll({
        logging: true,
        where:{
            thread_id: threadId,
            user_type: {[Op.in]:['user', 'mandoob']},
            is_delete: 0,
            deleted_at: null
        }
    });
} 
 catch (error) { return [null, error] }
}

const getParticipant = async (threadId, userId, userType) => {
    try {
        const instance = new sequelize.db(sequelize.models.chat_participants);
        return await instance.findOne({
            where: {
                thread_id: threadId,  // Use your actual column name
                user_id: userId,      // Use your actual column name  
                user_type: userType   // Use your actual column name
            }
        });
    } catch (error) {
        return [null, error];
    }
}




const getPendingUserRequests = async () => {
    try {
                // Get threads where users have sent messages but no admin has joined
        const threadInstance = new sequelize.db(sequelize.models.threads);
        
        let query = {
            attributes: ['id', 'type', 'status', 'created_at', 'updated_at',
                [
                    Sequelize.literal(`(
                        SELECT COUNT(*) 
                        FROM messages m
                        LEFT JOIN message_status ms ON (
                            ms.message_id = m.id 
                            AND ms.user_type IN ('user', 'mandoob')
                            AND ms.thread_id = threads.id
                        )
                        WHERE m.thread_id = threads.id 
                        AND m.deleted_at IS NULL 
                        AND m.sender_type IN ('user', 'mandoob')
                        AND ms.is_delete = 0
                    )`),
                    'unreadCount'
                ],
                // Add latest message timestamp for proper ordering
                [
                    Sequelize.literal(`(
                        SELECT MAX(created_at)
                        FROM messages m
                        WHERE m.thread_id = threads.id 
                        AND m.deleted_at IS NULL
                    )`),
                    'latestMessageTime'
                ]
            ],
            where: {
                [Op.and]: [
                    { type: 'support' },
                    { deleted_at: null },
                    // Thread must have at least one message
                    Sequelize.literal(`EXISTS (
                        SELECT 1 FROM messages
                        WHERE messages.thread_id = threads.id 
                        AND messages.deleted_at IS NULL
                    )`),
                    // Thread must have at least one user participant
                    Sequelize.literal(`EXISTS (
                        SELECT 1 FROM chat_participants 
                        WHERE chat_participants.thread_id = threads.id 
                        AND chat_participants.user_type IN ('user', 'mandoob')
                        AND chat_participants.status = 'active' 
                        AND chat_participants.deleted_at IS NULL
                    )`),
                    // Thread must NOT have any admin participants
                    Sequelize.literal(`NOT EXISTS (
                        SELECT 1 FROM chat_participants 
                        WHERE chat_participants.thread_id = threads.id 
                        AND chat_participants.user_type IN ('admin', 'super_admin', 'moderator')
                        AND chat_participants.status = 'active' 
                        AND chat_participants.deleted_at IS NULL
                    )`)
                ]
            },          
            include: [
                {
                    model: sequelize.models.chat_participants,
                    as: 'participants',
                    where: {
                        status: 'active',
                        deleted_at: null,
                        userType: { [Op.in]: ['user', 'mandoob'] } // Only include user participants in results
                    },
                    include: [
                        {
                            model: sequelize.models.users,
                            as: 'user',
                            attributes: ['id', 'name', 'email', 'status', 'profile_image'],
                            required: false, // only joins if user_type = 'user'
                            where: Sequelize.where(col('participants.user_type'), '=', 'user')
                        },
                        {
                            model: sequelize.models.mandoob_users,
                            as: 'mandoobUser',
                            attributes: ['id', 'name', 'email', 'mandoob_type', 'status', 'profile_image'],
                            required: false, // only joins if user_type = 'mandoob'
                            where: Sequelize.where(col('participants.user_type'), '=', 'mandoob')
                        }
                    ]
                },
                {
                    model: sequelize.models.messages,
                    as: 'messages',
                    where: {
                        deleted_at: null
                    },
                    required: true,
                    // Get the latest message for each thread
                    separate: true, // This ensures we get the latest message per thread
                    limit: 1,
                    order: [['created_at', 'DESC']],
                    attributes: ['id', 'content', 'messageType', 'created_at', 'senderId', 'senderType']
                }
            ],
            // ORDER BY latest message time instead of thread creation time
            order: [
                [Sequelize.literal('latestMessageTime'), 'DESC']
            ]
        };
        
        const [pendingThreads, pErr] = await threadInstance.findAndCountAll(query);
        if (pErr) return [null, pErr];
        
        return [pendingThreads, null]; 

    } catch (error) {
        return [null, error];
    }
}

const checkIsfirstMessage = async (threadId, type) => {
    try {
        const instance = new sequelize.db(sequelize.models.messages);
        return await instance.count({
            where: {
                threadId,
                senderType: type
            }
        });
    } catch (error) { return [null, error] }
}
module.exports = {
    getThreadsForInbox,
    getAllThreads,
    getThreadsPagination,
    getLastMessage,
    getUnreadCount,
    checkUserBlockStatus,
    checkToUserBlockStatus,
    getThread,
    getAllThreadWithParticipant,
    getThreadWithParticipant,
    createThread,
    createChatParticipants,
    bulkmessageStatusInsert,
    insertMessage,
    updateMessageReadStatus,
    // getInbox,
    getMessages, getProfile, setOnlineStatus, bulkMediaInsert, joinPrivateRooms,
    getMessagesStatus,
    getPendingUserRequests,
    checkIsfirstMessage,
    getParticipant
}