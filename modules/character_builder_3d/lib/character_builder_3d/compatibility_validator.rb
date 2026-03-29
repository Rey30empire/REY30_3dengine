# frozen_string_literal: true

module CharacterBuilder3D
  # Enforces category, skeleton, body type, and socket compatibility rules.
  class CompatibilityValidator
    DEFAULT_CATEGORY_SOCKET_MAP = {
      'body' => %w[body_root hips root skeleton_root],
      'head' => %w[head_socket neck_socket],
      'hair' => %w[head_socket],
      'torso' => %w[torso_socket chest_socket spine_socket],
      'arms' => %w[arms_socket left_arm_socket right_arm_socket left_hand_socket right_hand_socket],
      'legs' => %w[legs_socket hips_socket left_leg_socket right_leg_socket],
      'shoes' => %w[foot_socket left_foot_socket right_foot_socket],
      'outfit' => %w[outfit_socket chest_socket spine_socket hips_socket],
      'accessory' => %w[accessory_socket head_socket left_hand_socket right_hand_socket waist_socket back_socket]
    }.freeze

    def initialize(category_socket_map: DEFAULT_CATEGORY_SOCKET_MAP)
      @category_socket_map = category_socket_map.transform_keys { |key| ::CharacterBuilder3D.normalize_category(key) }
    end

    def validate(base_part:, new_part:, target_category:, current_state: nil)
      normalized_category = resolve_target_category(target_category, new_part)
      report = CompatibilityReport.new(
        part_id: new_part && new_part.id,
        target_category: normalized_category
      )

      if base_part.nil?
        report.add_error('missing_base', 'A base body must be loaded before modular parts can be equipped')
        return report
      end

      if new_part.nil?
        report.add_error('missing_part', 'The dropped part could not be found in the library')
        return report
      end

      unless ::CharacterBuilder3D.valid_category?(normalized_category)
        report.add_error('invalid_category', "Target category #{normalized_category} is not supported")
        return report
      end

      validate_category(new_part, normalized_category, report)
      validate_skeleton(base_part, current_state, new_part, report)
      validate_body_type(base_part, current_state, new_part, report)
      validate_socket(new_part, normalized_category, report)

      report.merge_details(
        base_body_id: base_part.id,
        base_skeleton_id: current_state && current_state.base_skeleton_id,
        part_skeleton_id: new_part.skeleton_id,
        part_body_type: new_part.body_type
      )
    end

    def compatible?(base_part:, new_part:, target_category:, current_state: nil)
      validate(
        base_part: base_part,
        new_part: new_part,
        target_category: target_category,
        current_state: current_state
      ).compatible?
    end

    private

    def resolve_target_category(target_category, new_part)
      requested = target_category || (new_part && new_part.category)
      ::CharacterBuilder3D.normalize_category(requested)
    end

    def validate_category(new_part, normalized_category, report)
      return if new_part.category == normalized_category

      report.add_error(
        'category_mismatch',
        "Part category #{new_part.category} does not match target zone #{normalized_category}",
        part_category: new_part.category
      )
    end

    def validate_skeleton(base_part, current_state, new_part, report)
      expected_skeleton_id = if current_state && current_state.base_skeleton_id && !current_state.base_skeleton_id.empty?
                               current_state.base_skeleton_id
                             else
                               base_part.skeleton_id
                             end

      return if expected_skeleton_id.empty? || new_part.skeleton_id.empty?
      return if expected_skeleton_id == new_part.skeleton_id

      report.add_error(
        'skeleton_mismatch',
        "Part skeleton #{new_part.skeleton_id} does not match base skeleton #{expected_skeleton_id}",
        expected_skeleton_id: expected_skeleton_id,
        actual_skeleton_id: new_part.skeleton_id
      )
    end

    def validate_body_type(base_part, current_state, new_part, report)
      expected_body_type = if current_state && current_state.body_type && !current_state.body_type.empty?
                             current_state.body_type
                           else
                             base_part.body_type
                           end

      return if expected_body_type.empty? || new_part.body_type.empty?
      return if expected_body_type == new_part.body_type

      report.add_error(
        'body_type_mismatch',
        "Part body type #{new_part.body_type} does not match base body type #{expected_body_type}",
        expected_body_type: expected_body_type,
        actual_body_type: new_part.body_type
      )
    end

    def validate_socket(new_part, normalized_category, report)
      return if normalized_category == 'body'

      if new_part.attachment_socket.empty?
        report.add_error(
          'missing_socket',
          "Part #{new_part.id} must declare an attachment_socket for category #{normalized_category}"
        )
        return
      end

      allowed_sockets = Array(@category_socket_map[normalized_category])
      return if allowed_sockets.empty? || allowed_sockets.include?(new_part.attachment_socket)

      report.add_error(
        'socket_mismatch',
        "Part socket #{new_part.attachment_socket} is not valid for category #{normalized_category}",
        allowed_sockets: allowed_sockets,
        actual_socket: new_part.attachment_socket
      )
    end
  end
end
